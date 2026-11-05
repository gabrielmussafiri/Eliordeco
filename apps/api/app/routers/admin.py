import re
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import Response
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..availability import (
    AvailabilityError, blocked_range, check_availability, lock_products, peak_usage, _used_intervals,
)
from .. import notifications as notify
from ..config import settings as cfg
from ..db import get_db
from ..enums import (
    BLOCKING_STATUSES, BookingStatus, FulfillmentMethod, PaymentRecordStatus, PaymentStatus,
)
from ..models import (
    AuditLog, Booking, LoginAttempt, Category, Customer, DeliveryRecord, MaintenancePeriod, PaymentEvidence,
    PaymentRecord, Product, ProductImage, User,
)
from ..schemas import (
    AdminBookingIn, AdminPaymentIn, BookingPatch, CategoryIn, CategoryOut, CustomerPatch, DeliveryPatch,
    LoginIn, MaintenanceIn, ProductIn, ProductOut, RescheduleIn, ReviewIn, StatusIn,
)
from ..security import (
    RateLimiter, create_session, current_admin, destroy_session, require_owner, verify_password,
)
from ..serializers import booking_out, payment_out
from ..services import (
    BusinessRuleError, audit, change_status, create_booking, money, outstanding_balance, price_items,
    record_admin_payment, recompute_payment_status, review_payment, verified_total,
)
from ..settings_store import DEFAULTS, get_settings, set_setting
from ..storage import load, read_validated, store

router = APIRouter(prefix="/api/admin")
limit_login = RateLimiter(8, 300, "login")
LOCKOUT_FAILURES, LOCKOUT_MINUTES = 8, 15
secured = [Depends(current_admin)]


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "item"


def unique_slug(db: Session, model, base: str, exclude_id: int | None = None) -> str:
    slug, n = base, 2
    while True:
        q = select(model.id).where(model.slug == slug)
        if exclude_id:
            q = q.where(model.id != exclude_id)
        if not db.scalar(q):
            return slug
        slug, n = f"{base}-{n}", n + 1


# ---------- Authentification ----------

@router.post("/login", dependencies=[Depends(limit_login)])
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    email = body.email.strip().lower()[:255]
    now = datetime.now(timezone.utc)
    db.execute(delete(LoginAttempt).where(LoginAttempt.created_at < now - timedelta(days=1)))
    recent = db.scalar(select(func.count()).select_from(LoginAttempt).where(
        LoginAttempt.email == email, LoginAttempt.created_at > now - timedelta(minutes=LOCKOUT_MINUTES)))
    if recent >= LOCKOUT_FAILURES:
        # Même message que pour un mauvais mot de passe côté client ; seul le code 429 indique l'attente.
        raise HTTPException(429, "Too many failed attempts. Try again in a few minutes.")
    user = db.scalar(select(User).where(User.email == email))
    if not user or not user.is_active or not verify_password(user.password_hash, body.password):
        db.add(LoginAttempt(email=email))
        db.commit()
        raise HTTPException(401, "Invalid credentials")
    token = create_session(db, user)
    db.commit()
    response.set_cookie(cfg.session_cookie_name, token, httponly=True, samesite="lax",
                        secure=cfg.secret_key != "dev-only-change-me", max_age=cfg.session_ttl_hours * 3600,
                        path="/")
    return {"email": user.email, "full_name": user.full_name, "role": user.role.value}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(cfg.session_cookie_name)
    if token:
        destroy_session(db, token)
        db.commit()
    response.delete_cookie(cfg.session_cookie_name, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_admin)):
    return {"email": user.email, "full_name": user.full_name, "role": user.role.value}


# ---------- Catégories ----------

@router.get("/categories", response_model=list[CategoryOut], dependencies=secured)
def list_categories(db: Session = Depends(get_db)):
    return db.scalars(select(Category).order_by(Category.sort_order, Category.name)).all()


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(body: CategoryIn, user: User = Depends(current_admin), db: Session = Depends(get_db)):
    c = Category(name=body.name, sort_order=body.sort_order, slug=unique_slug(db, Category, slugify(body.name)))
    db.add(c)
    db.flush()
    audit(db, user.id, "category.created", "category", c.id, after={"name": c.name})
    db.commit()
    return c


@router.put("/categories/{cid}", response_model=CategoryOut)
def update_category(cid: int, body: CategoryIn, user: User = Depends(current_admin),
                    db: Session = Depends(get_db)):
    c = db.get(Category, cid) or _404()
    c.name, c.sort_order = body.name, body.sort_order
    audit(db, user.id, "category.updated", "category", c.id, after={"name": c.name})
    db.commit()
    return c


@router.delete("/categories/{cid}", status_code=204)
def delete_category(cid: int, user: User = Depends(current_admin), db: Session = Depends(get_db)):
    c = db.get(Category, cid) or _404()
    audit(db, user.id, "category.deleted", "category", c.id, before={"name": c.name})
    db.delete(c)  # les produits passent à category_id NULL
    db.commit()


def _404():
    raise HTTPException(404, "Not found")


# ---------- Produits ----------

@router.get("/products", response_model=list[ProductOut], dependencies=secured)
def list_products(db: Session = Depends(get_db)):
    return db.scalars(select(Product).options(selectinload(Product.images), selectinload(Product.category))
                      .order_by(Product.name)).all()


def _apply_product(p: Product, body: ProductIn):
    for k, v in body.model_dump().items():
        setattr(p, k, v)


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(body: ProductIn, user: User = Depends(current_admin), db: Session = Depends(get_db)):
    p = Product(slug=unique_slug(db, Product, slugify(body.name)), unit_price=body.unit_price)
    _apply_product(p, body)
    db.add(p)
    db.flush()
    audit(db, user.id, "product.created", "product", p.id, after={"name": p.name})
    db.commit()
    return p


@router.put("/products/{pid}", response_model=ProductOut)
def update_product(pid: int, body: ProductIn, user: User = Depends(current_admin), db: Session = Depends(get_db)):
    p = db.get(Product, pid) or _404()
    before = {"unit_price": str(p.unit_price), "total_quantity": p.total_quantity, "is_active": p.is_active}
    _apply_product(p, body)  # les réservations existantes gardent leurs prix historisés
    audit(db, user.id, "product.updated", "product", p.id, before,
          {"unit_price": str(p.unit_price), "total_quantity": p.total_quantity, "is_active": p.is_active})
    db.commit()
    return p


@router.post("/products/{pid}/images", status_code=201)
async def add_image(pid: int, file: UploadFile = File(), user: User = Depends(current_admin),
                    db: Session = Depends(get_db)):
    p = db.get(Product, pid) or _404()
    data, ctype, ext = await read_validated(file, allow_pdf=False)
    key = store(db, data, ctype, ext, private=False)
    img = ProductImage(product_id=p.id, url=f"/media/{key}", alt=p.name, sort_order=len(p.images))
    db.add(img)
    audit(db, user.id, "product.image_added", "product", p.id)
    db.commit()
    return {"id": img.id, "url": img.url}


@router.delete("/products/{pid}/images/{iid}", status_code=204)
def delete_image(pid: int, iid: int, user: User = Depends(current_admin), db: Session = Depends(get_db)):
    img = db.get(ProductImage, iid)
    if not img or img.product_id != pid:
        _404()
    db.delete(img)
    audit(db, user.id, "product.image_removed", "product", pid)
    db.commit()


# ---------- Maintenance / équipement endommagé ----------

@router.get("/maintenance", dependencies=secured)
def list_maintenance(db: Session = Depends(get_db)):
    rows = db.scalars(select(MaintenancePeriod).order_by(MaintenancePeriod.start_at.desc())).all()
    return [{"id": m.id, "product_id": m.product_id, "quantity": m.quantity, "start_at": m.start_at,
             "end_at": m.end_at, "reason": m.reason, "is_damage": m.is_damage} for m in rows]


@router.post("/maintenance", status_code=201)
def create_maintenance(body: MaintenanceIn, user: User = Depends(current_admin), db: Session = Depends(get_db)):
    if body.end_at <= body.start_at or body.start_at.tzinfo is None or body.end_at.tzinfo is None:
        raise HTTPException(422, "Invalid period")
    products = lock_products(db, [body.product_id])
    p = products.get(body.product_id) or _404()
    if body.quantity > p.total_quantity:
        raise HTTPException(422, "Quantity exceeds stock")
    m = MaintenancePeriod(**body.model_dump())
    db.add(m)
    db.flush()
    audit(db, user.id, "maintenance.created", "maintenance", m.id, after=body.model_dump(mode="json"))
    db.commit()
    # Avertit des réservations déjà en conflit (non annulées automatiquement)
    conflicts = db.scalars(select(Booking.reference).join(Booking.items).where(
        Booking.status.in_(BLOCKING_STATUSES), Booking.items.any(product_id=p.id),
        Booking.blocked_start < body.end_at, Booking.blocked_end > body.start_at)).all()
    return {"id": m.id, "conflicting_bookings": list(dict.fromkeys(conflicts))}


@router.delete("/maintenance/{mid}", status_code=204)
def delete_maintenance(mid: int, user: User = Depends(current_admin), db: Session = Depends(get_db)):
    m = db.get(MaintenancePeriod, mid) or _404()
    db.delete(m)
    audit(db, user.id, "maintenance.deleted", "maintenance", mid)
    db.commit()


# ---------- Réservations ----------

def _booking(db: Session, ref: str) -> Booking:
    b = db.scalar(select(Booking).where(Booking.reference == ref.upper()))
    return b or _404()


@router.get("/bookings", dependencies=secured)
def list_bookings(q: str | None = None, status: BookingStatus | None = None,
                  payment_status: PaymentStatus | None = None, date_from: datetime | None = None,
                  date_to: datetime | None = None, limit: int = 100, offset: int = 0,
                  db: Session = Depends(get_db)):
    stmt = select(Booking).options(selectinload(Booking.customer), selectinload(Booking.items))
    if q:
        like = f"%{q.strip()[:80]}%"
        stmt = stmt.join(Customer).where(or_(Booking.reference.ilike(like), Customer.full_name.ilike(like),
                                             Customer.email.ilike(like)))
    if status:
        stmt = stmt.where(Booking.status == status)
    if payment_status:
        stmt = stmt.where(Booking.payment_status == payment_status)
    if date_from:
        stmt = stmt.where(Booking.end_at >= date_from)
    if date_to:
        stmt = stmt.where(Booking.start_at <= date_to)
    rows = db.scalars(stmt.order_by(Booking.created_at.desc()).limit(min(limit, 200)).offset(offset)).all()
    return [{"reference": b.reference, "status": b.status.value, "payment_status": b.payment_status.value,
             "customer": b.customer.full_name, "start_at": b.start_at, "end_at": b.end_at,
             "total": b.total, "item_count": sum(i.quantity for i in b.items),
             "created_at": b.created_at} for b in rows]


@router.get("/bookings/{ref}", dependencies=secured)
def booking_detail(ref: str, db: Session = Depends(get_db)):
    return booking_out(_booking(db, ref), get_settings(db), admin=True)


def _avail_409(e: AvailabilityError):
    return HTTPException(409, {"code": "insufficient_inventory", "items": [
        {"product_id": s.product_id, "requested": s.requested, "available": s.available} for s in e.shortages]})


@router.post("/bookings", status_code=201)
def admin_create_booking(body: AdminBookingIn, background: BackgroundTasks, user: User = Depends(current_admin), db: Session = Depends(get_db)):
    if body.status not in (BookingStatus.PENDING_REVIEW, BookingStatus.CONFIRMED):
        raise HTTPException(422, "Manual bookings start as pending_review or confirmed")
    s = get_settings(db)
    try:
        b, _ = create_booking(
            db, items=[(i.product_id, i.quantity) for i in body.items], start=body.start_at, end=body.end_at,
            settings=s, customer=body.customer.model_dump(), fulfillment=body.fulfillment,
            delivery_address=body.delivery_address, event_type=body.event_type,
            instructions=body.instructions, status=body.status)
        audit(db, user.id, "booking.created_manually", "booking", b.id)
        db.commit()
    except AvailabilityError as e:
        db.rollback()
        raise _avail_409(e)
    except (BusinessRuleError, ValueError) as e:
        db.rollback()
        raise HTTPException(422, str(e))
    notify.queue(background, [notify.booking_confirmed(b, s) if b.status == BookingStatus.CONFIRMED else notify.booking_received(b, s)])
    return booking_out(b, s, admin=True)


@router.post("/bookings/{ref}/status")
def set_status(ref: str, body: StatusIn, background: BackgroundTasks, user: User = Depends(current_admin), db: Session = Depends(get_db)):
    b = _booking(db, ref)
    try:
        change_status(db, b, body.status, user.id, body.reason)
    except BusinessRuleError as e:
        raise HTTPException(409, str(e))
    db.commit()
    s = get_settings(db)
    mail = {BookingStatus.CONFIRMED: notify.booking_confirmed, BookingStatus.REJECTED: notify.booking_rejected,
            BookingStatus.CANCELLED: notify.booking_cancelled}.get(body.status)
    if mail:
        notify.queue(background, [mail(b, s)])
    return booking_out(b, s, admin=True)


@router.patch("/bookings/{ref}")
def patch_booking(ref: str, body: BookingPatch, user: User = Depends(current_admin), db: Session = Depends(get_db)):
    b = _booking(db, ref)
    before = {"delivery_fee": str(b.delivery_fee)}
    if body.internal_notes is not None:
        b.internal_notes = body.internal_notes
    if body.instructions is not None:
        b.instructions = body.instructions
    if body.delivery_fee is not None:
        b.delivery_fee = money(body.delivery_fee)
        b.total = money(b.subtotal + b.delivery_fee + b.deposit_amount)
        recompute_payment_status(b)
    audit(db, user.id, "booking.updated", "booking", b.id, before, {"delivery_fee": str(b.delivery_fee)})
    db.commit()
    return booking_out(b, get_settings(db), admin=True)


@router.post("/bookings/{ref}/reschedule")
def reschedule(ref: str, body: RescheduleIn, user: User = Depends(current_admin), db: Session = Depends(get_db)):
    b = _booking(db, ref)
    if b.status not in BLOCKING_STATUSES:
        raise HTTPException(409, "Only open bookings can be rescheduled")
    s = get_settings(db)
    items = [(i.product_id, i.quantity) for i in b.items]
    products = lock_products(db, [pid for pid, _ in items])
    try:
        res, window = check_availability(db, items, body.start_at, body.end_at, s,
                                         exclude_booking_id=b.id, products=products)
    except ValueError as e:
        raise HTTPException(422, str(e))
    short = [r for r in res if not r.ok]
    if short:
        db.rollback()
        raise _avail_409(AvailabilityError(short))
    start, end = body.start_at.astimezone(timezone.utc), body.end_at.astimezone(timezone.utc)
    lines, subtotal, _ = price_items(products, items, start, end)
    before = {"start_at": b.start_at.isoformat(), "end_at": b.end_at.isoformat(), "total": str(b.total)}
    for old, new in zip(sorted(b.items, key=lambda i: i.product_id), sorted(lines, key=lambda i: i.product_id)):
        old.billable_units, old.line_total = new.billable_units, new.line_total  # prix unitaires historisés conservés
    b.start_at, b.end_at, b.blocked_start, b.blocked_end = start, end, window[0], window[1]
    b.subtotal = money(sum((i.line_total for i in b.items), Decimal("0")))
    b.total = money(b.subtotal + b.delivery_fee + b.deposit_amount)
    if b.delivery:
        b.delivery.delivery_at, b.delivery.return_at = start, end
    recompute_payment_status(b)
    audit(db, user.id, "booking.rescheduled", "booking", b.id, before,
          {"start_at": start.isoformat(), "end_at": end.isoformat(), "total": str(b.total)})
    db.commit()
    return booking_out(b, s, admin=True)


@router.patch("/bookings/{ref}/delivery")
def patch_delivery(ref: str, body: DeliveryPatch, user: User = Depends(current_admin), db: Session = Depends(get_db)):
    b = _booking(db, ref)
    if not b.delivery:
        b.delivery = DeliveryRecord()
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(b.delivery, k, v)
    audit(db, user.id, "delivery.updated", "booking", b.id, after=body.model_dump(mode="json", exclude_unset=True))
    db.commit()
    return booking_out(b, get_settings(db), admin=True)


# ---------- Paiements ----------

@router.get("/payments", dependencies=secured)
def list_payments(status: PaymentRecordStatus | None = None, limit: int = 100, db: Session = Depends(get_db)):
    stmt = select(PaymentRecord).options(selectinload(PaymentRecord.booking).selectinload(Booking.customer),
                                         selectinload(PaymentRecord.evidence))
    if status:
        stmt = stmt.where(PaymentRecord.status == status)
    rows = db.scalars(stmt.order_by(PaymentRecord.created_at.desc()).limit(min(limit, 200))).all()
    return [{**payment_out(p), "booking_reference": p.booking.reference, "customer": p.booking.customer.full_name,
             "booking_total": p.booking.total, "admin_notes": p.admin_notes} for p in rows]


@router.post("/payments/{pid}/review")
def review(pid: int, body: ReviewIn, background: BackgroundTasks, user: User = Depends(current_admin), db: Session = Depends(get_db)):
    rec = db.get(PaymentRecord, pid) or _404()
    try:
        review_payment(db, rec, user_id=user.id, approve=body.approve, notes=body.notes)
    except BusinessRuleError as e:
        raise HTTPException(409, str(e))
    db.commit()
    s = get_settings(db)
    notify.queue(background, [(notify.payment_verified if body.approve else notify.payment_rejected)(rec.booking, rec, s)])
    return {**payment_out(rec), "booking_payment_status": rec.booking.payment_status.value}


@router.post("/bookings/{ref}/payments", status_code=201)
def admin_record_payment(ref: str, body: AdminPaymentIn, user: User = Depends(current_admin),
                         db: Session = Depends(get_db)):
    b = _booking(db, ref)
    try:
        rec = record_admin_payment(db, b, user_id=user.id, amount=body.amount, method=body.method,
                                   paid_on=body.paid_on, cash=body.cash, notes=body.notes)
    except BusinessRuleError as e:
        raise HTTPException(422, str(e))
    db.commit()
    return payment_out(rec)


@router.get("/evidence/{eid}", dependencies=secured)
def evidence(eid: int, db: Session = Depends(get_db)):
    ev = db.get(PaymentEvidence, eid) or _404()
    f = load(db, ev.storage_key, private=True)
    return Response(f.data, media_type=f.content_type,
                    headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"})


@router.get("/audit", dependencies=secured)
def audit_trail(entity_type: str | None = None, entity_id: int | None = None, limit: int = 100,
                db: Session = Depends(get_db)):
    stmt = select(AuditLog)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    return [{"id": a.id, "user_id": a.user_id, "action": a.action, "entity_type": a.entity_type,
             "entity_id": a.entity_id, "before": a.before, "after": a.after, "created_at": a.created_at}
            for a in db.scalars(stmt.order_by(AuditLog.id.desc()).limit(min(limit, 500)))]


# ---------- Clients ----------

@router.get("/customers", dependencies=secured)
def list_customers(q: str | None = None, db: Session = Depends(get_db)):
    stmt = select(Customer)
    if q:
        like = f"%{q.strip()[:80]}%"
        stmt = stmt.where(or_(Customer.full_name.ilike(like), Customer.email.ilike(like), Customer.phone.ilike(like)))
    out = []
    for c in db.scalars(stmt.order_by(Customer.full_name).limit(200)):
        bookings = db.scalars(select(Booking).options(selectinload(Booking.payments))
                              .where(Booking.customer_id == c.id)).all()
        out.append({"id": c.id, "full_name": c.full_name, "email": c.email, "phone": c.phone,
                    "internal_notes": c.internal_notes, "booking_count": len(bookings),
                    "verified_total": sum((verified_total(b) for b in bookings), Decimal("0")),
                    "outstanding": sum((outstanding_balance(b) for b in bookings), Decimal("0")),
                    "bookings": [{"reference": b.reference, "status": b.status.value, "total": b.total,
                                  "start_at": b.start_at} for b in bookings]})
    return out


@router.patch("/customers/{cid}")
def patch_customer(cid: int, body: CustomerPatch, user: User = Depends(current_admin), db: Session = Depends(get_db)):
    c = db.get(Customer, cid) or _404()
    c.internal_notes = body.internal_notes
    audit(db, user.id, "customer.notes", "customer", c.id)
    db.commit()
    return {"id": c.id, "internal_notes": c.internal_notes}


# ---------- Paramètres (propriétaire uniquement) ----------

@router.get("/settings", dependencies=secured)
def read_settings(db: Session = Depends(get_db)):
    return get_settings(db)


@router.put("/settings")
def write_settings(body: dict, user: User = Depends(require_owner), db: Session = Depends(get_db)):
    unknown = set(body) - set(DEFAULTS)
    if unknown:
        raise HTTPException(422, f"Unknown settings: {sorted(unknown)}")
    if "timezone" in body:
        try:
            ZoneInfo(body["timezone"])
        except Exception:
            raise HTTPException(422, "Invalid timezone")
    if "whatsapp_number" in body and body["whatsapp_number"] and not re.fullmatch(r"\+?\d{8,15}", str(body["whatsapp_number"])):
        raise HTTPException(422, "WhatsApp number must be 8-15 digits (international format)")
    if "deposit_percentage" in body and not 0 <= float(body["deposit_percentage"]) <= 100:
        raise HTTPException(422, "Deposit percentage must be between 0 and 100")
    for k, v in body.items():
        set_setting(db, k, v)
    audit(db, user.id, "settings.updated", "settings", None, after={"keys": sorted(body)})
    db.commit()
    return get_settings(db)


# ---------- Calendrier & tableau de bord ----------

@router.get("/calendar", dependencies=secured)
def calendar(start: datetime, end: datetime, db: Session = Depends(get_db)):
    bookings = db.scalars(select(Booking).options(selectinload(Booking.customer), selectinload(Booking.items))
                          .where(Booking.status.in_(BLOCKING_STATUSES), Booking.start_at < end,
                                 Booking.end_at > start).order_by(Booking.start_at)).all()
    maint = db.scalars(select(MaintenancePeriod).where(MaintenancePeriod.start_at < end,
                                                       MaintenancePeriod.end_at > start)).all()
    return {
        "bookings": [{"reference": b.reference, "status": b.status.value, "customer": b.customer.full_name,
                      "start_at": b.start_at, "end_at": b.end_at, "fulfillment": b.fulfillment_method.value,
                      "items": [{"name": i.product_name, "quantity": i.quantity} for i in b.items]}
                     for b in bookings],
        "maintenance": [{"id": m.id, "product_id": m.product_id, "start_at": m.start_at, "end_at": m.end_at,
                         "reason": m.reason, "is_damage": m.is_damage, "quantity": m.quantity} for m in maint],
    }


@router.get("/calendar/inventory", dependencies=secured)
def calendar_inventory(day_from: date, days: int = 31, db: Session = Depends(get_db)):
    """Stock restant par produit et par jour (fuseau de l'entreprise)."""
    s = get_settings(db)
    tz = ZoneInfo(s["timezone"])
    days = max(1, min(days, 62))
    out = []
    for p in db.scalars(select(Product).where(Product.is_active.is_(True)).order_by(Product.name)):
        row = []
        for n in range(days):
            d = day_from + timedelta(days=n)
            ws = datetime.combine(d, time.min, tz).astimezone(timezone.utc)
            we = datetime.combine(d + timedelta(days=1), time.min, tz).astimezone(timezone.utc)
            used = peak_usage(_used_intervals(db, p.id, (ws, we), None, None), (ws, we))
            row.append({"date": d.isoformat(), "remaining": max(p.total_quantity - used, 0)})
        out.append({"product_id": p.id, "name": p.name, "total": p.total_quantity, "days": row})
    return out


@router.get("/dashboard", dependencies=secured)
def dashboard(db: Session = Depends(get_db)):
    s = get_settings(db)
    tz = ZoneInfo(s["timezone"])
    now = datetime.now(timezone.utc)
    local = now.astimezone(tz)
    month_start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    next_month = (month_start + timedelta(days=32)).replace(day=1)
    count = lambda *w: db.scalar(select(func.count()).select_from(Booking).where(*w)) or 0  # noqa: E731
    week = now + timedelta(days=7)
    revenue = db.scalar(select(func.coalesce(func.sum(PaymentRecord.amount), 0)).where(
        PaymentRecord.status == PaymentRecordStatus.VERIFIED, PaymentRecord.paid_on >= month_start,
        PaymentRecord.paid_on < next_month))
    open_bookings = db.scalars(select(Booking).options(selectinload(Booking.payments)).where(
        Booking.status.in_((BookingStatus.CONFIRMED, BookingStatus.ACTIVE, BookingStatus.COMPLETED)))).all()
    low = []
    for p in db.scalars(select(Product).where(Product.is_active.is_(True))):
        if p.total_quantity == 0:
            low.append({"product": p.name, "alert": "No stock configured"})
    for m in db.scalars(select(MaintenancePeriod).where(MaintenancePeriod.start_at <= now,
                                                        MaintenancePeriod.end_at > now)):
        low.append({"product": db.get(Product, m.product_id).name,
                    "alert": ("Damaged" if m.is_damage else "In maintenance") + f" ({m.quantity})"})
    def brief(stmt):
        return [{"reference": b.reference, "customer": b.customer.full_name, "start_at": b.start_at,
                 "end_at": b.end_at} for b in db.scalars(stmt.options(selectinload(Booking.customer)))]
    return {
        "total_bookings": count(),
        "pending": count(Booking.status == BookingStatus.PENDING_REVIEW),
        "confirmed": count(Booking.status == BookingStatus.CONFIRMED),
        "active": count(Booking.status == BookingStatus.ACTIVE),
        "monthly_revenue": money(revenue),
        "outstanding_balance": money(sum((outstanding_balance(b) for b in open_bookings), Decimal("0"))),
        "payments_to_review": db.scalar(select(func.count()).select_from(PaymentRecord).where(
            PaymentRecord.status == PaymentRecordStatus.SUBMITTED)) or 0,
        "upcoming_pickups": brief(select(Booking).where(Booking.status == BookingStatus.CONFIRMED,
                                                        Booking.start_at >= now, Booking.start_at < week)
                                  .order_by(Booking.start_at)),
        "upcoming_returns": brief(select(Booking).where(Booking.status.in_((BookingStatus.CONFIRMED, BookingStatus.ACTIVE)),
                                                        Booking.end_at >= now, Booking.end_at < week)
                                  .order_by(Booking.end_at)),
        "inventory_alerts": low,
    }
