import secrets
from datetime import datetime, timezone

import time
from collections import defaultdict

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from decimal import Decimal
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .. import notifications as notify
from .. import whatsapp
from ..availability import AvailabilityError, check_availability, create_hold, full_days
from ..config import settings as cfg
from ..db import get_db
from ..models import Booking, Category, Customer, PaymentEvidence, PaymentRecord, Product
from ..schemas import DaysIn, ResendIn, BookingIn, CategoryOut, HoldIn, PeriodIn, ProductOut, QuoteIn
from ..security import RateLimiter
from ..serializers import booking_out
from ..enums import FulfillmentMethod
from ..availability import ensure_utc
from ..services import BusinessRuleError, create_booking, expire_stale_pending, hash_token, money, price_items, submit_payment
from ..settings_store import get_settings
from ..storage import load, read_validated, store

router = APIRouter(prefix="/api")
media_router = APIRouter()


@media_router.get("/media/{key}")
def media(key: str, db: Session = Depends(get_db)):
    """Photos produit publiques. Le nom de fichier est aléatoire et unique : cache d'un an sans risque."""
    f = load(db, key, private=False)
    return Response(f.data, media_type=f.content_type,
                    headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})
limit_write = RateLimiter(20, 60, "write")
limit_lookup = RateLimiter(30, 60, "lookup")


def _shortage_detail(e: AvailabilityError):
    return {"code": "insufficient_inventory",
            "items": [{"product_id": s.product_id, "requested": s.requested, "available": s.available}
                      for s in e.shortages]}


@router.get("/settings/public")
def public_settings(db: Session = Depends(get_db)):
    s = get_settings(db)
    keys = ["business_name", "contact_email", "whatsapp_number", "business_address", "timezone", "currency",
            "operating_hours", "rental_policies", "cancellation_policy", "delivery_enabled", "delivery_fee",
            "deposit_percentage", "pending_expiry_hours"]
    return {k: s[k] for k in keys}  # jamais les coordonnées bancaires ici


@router.get("/categories", response_model=list[CategoryOut])
def categories(db: Session = Depends(get_db)):
    """Seulement les catégories qui contiennent au moins un produit visible (pas de rayon vide côté public)."""
    used = select(Product.category_id).where(Product.is_active.is_(True), Product.category_id.is_not(None))
    return db.scalars(select(Category).where(Category.id.in_(used)).order_by(Category.sort_order, Category.name)).all()


@router.get("/products", response_model=list[ProductOut])
def products(category: str | None = None, q: str | None = None, sort: str = "name",
             db: Session = Depends(get_db)):
    stmt = (select(Product).options(selectinload(Product.images), selectinload(Product.category))
            .where(Product.is_active.is_(True)))
    if category:
        stmt = stmt.join(Category).where(Category.slug == category)
    if q:
        stmt = stmt.where(Product.name.ilike(f"%{q.strip()[:80]}%"))
    order = {"price_asc": Product.unit_price.asc(), "price_desc": Product.unit_price.desc()}.get(
        sort, Product.name.asc())
    return db.scalars(stmt.order_by(order)).all()


@router.get("/products/{slug}", response_model=ProductOut)
def product(slug: str, db: Session = Depends(get_db)):
    p = db.scalar(select(Product).options(selectinload(Product.images), selectinload(Product.category))
                  .where(Product.slug == slug, Product.is_active.is_(True)))
    if not p:
        raise HTTPException(404, "Product not found")
    return p


@router.get("/products/{slug}/whatsapp")
def product_whatsapp(slug: str, db: Session = Depends(get_db)):
    p = db.scalar(select(Product).where(Product.slug == slug, Product.is_active.is_(True)))
    if not p:
        raise HTTPException(404, "Product not found")
    return {"url": whatsapp.product_inquiry(get_settings(db)["whatsapp_number"], p.name)}


@router.post("/availability", dependencies=[Depends(limit_lookup)])
def availability(body: PeriodIn, db: Session = Depends(get_db)):
    s = get_settings(db)
    try:
        res, _ = check_availability(db, [(i.product_id, i.quantity) for i in body.items],
                                    body.start_at, body.end_at, s)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"available": all(r.ok for r in res),
            "items": [{"product_id": r.product_id, "requested": r.requested,
                       "available": r.available, "ok": r.ok} for r in res]}


@router.post("/quote", dependencies=[Depends(limit_lookup)])
def quote(body: QuoteIn, db: Session = Depends(get_db)):
    """Devis officiel calculé par le serveur (le navigateur n'affiche que ce résultat)."""
    s = get_settings(db)
    start, end = ensure_utc(body.start_at), ensure_utc(body.end_at)
    if end <= start:
        raise HTTPException(422, "Return must be after start")
    merged: dict[int, int] = {}
    for i in body.items:
        merged[i.product_id] = merged.get(i.product_id, 0) + i.quantity
    products = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_(merged), Product.is_active.is_(True)))}
    if len(products) != len(merged):
        raise HTTPException(422, "Unknown or unavailable product")
    lines, subtotal, deposit = price_items(products, sorted(merged.items()), start, end)
    fee = money(s["delivery_fee"]) if body.fulfillment == FulfillmentMethod.DELIVERY else money(0)
    return {
        "lines": [{"product_id": l.product_id, "product_name": l.product_name, "quantity": l.quantity,
                   "unit_price": l.unit_price, "pricing_unit": l.pricing_unit.value,
                   "billable_units": l.billable_units, "deposit": l.deposit, "line_total": l.line_total}
                  for l in lines],
        "subtotal": subtotal, "delivery_fee": fee, "deposit_amount": deposit,
        "total": money(subtotal + fee + deposit),
    }


@router.post("/availability/days", dependencies=[Depends(limit_lookup)])
def availability_days(body: DaysIn, db: Session = Depends(get_db)):
    """Jours complets (aucun créneau avec assez de stock) pour griser le sélecteur de dates."""
    s = get_settings(db)
    merged: dict[int, int] = {}
    for i in body.items:
        merged[i.product_id] = merged.get(i.product_id, 0) + i.quantity
    return {"full": full_days(db, sorted(merged.items()), body.first_day, body.days, s)}


@router.post("/holds", dependencies=[Depends(limit_write)])
def hold(body: HoldIn, db: Session = Depends(get_db)):
    s = get_settings(db)
    token = body.token or secrets.token_urlsafe(24)
    try:
        create_hold(db, token, [(i.product_id, i.quantity) for i in body.items],
                    body.start_at, body.end_at, s, cfg.hold_ttl_minutes)
        db.commit()
    except AvailabilityError as e:
        db.rollback()
        raise HTTPException(409, _shortage_detail(e))
    except ValueError as e:
        db.rollback()
        raise HTTPException(422, str(e))
    return {"token": token, "ttl_minutes": cfg.hold_ttl_minutes}


@router.post("/bookings", status_code=201, dependencies=[Depends(limit_write)])
def submit_booking(body: BookingIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    s = get_settings(db)
    expired = expire_stale_pending(db, s)
    db.commit()
    notify.queue(background, [notify.booking_expired(x, s) for x in expired])
    try:
        b, token = create_booking(
            db, items=[(i.product_id, i.quantity) for i in body.items], start=body.start_at, end=body.end_at,
            settings=s, customer=body.customer.model_dump(), fulfillment=body.fulfillment,
            delivery_address=body.delivery_address, event_type=body.event_type,
            instructions=body.instructions, hold_token=body.hold_token)
        db.commit()
    except AvailabilityError as e:
        db.rollback()
        raise HTTPException(409, _shortage_detail(e))
    except (BusinessRuleError, ValueError) as e:
        db.rollback()
        raise HTTPException(422, str(e))
    notify.queue(background, [notify.booking_received(b, s), notify.owner_new_request(b, s)])
    return {"access_token": token, "booking": booking_out(b, s)}


# ---------- Portail client : référence + jeton secret ----------

def _portal_booking(reference: str, token: str | None, db: Session) -> Booking:
    b = db.scalar(select(Booking).where(Booking.reference == reference.upper()))
    # Réponse identique que la référence existe ou non : pas d'énumération
    if not b or not token or not secrets.compare_digest(b.access_token_hash, hash_token(token)):
        raise HTTPException(404, "Booking not found")
    return b


@router.get("/portal/{reference}", dependencies=[Depends(limit_lookup)])
def portal_get(reference: str, x_access_token: str | None = Header(default=None),
               db: Session = Depends(get_db)):
    b = _portal_booking(reference, x_access_token, db)
    s = get_settings(db)
    out = booking_out(b, s)
    out["payment_info"] = {"instructions": s["payment_instructions"], "methods": s["payment_methods"],
                           "bank_details": s["bank_details"], "deposit_percentage": s["deposit_percentage"]}
    return out


@router.post("/portal/{reference}/payments", status_code=201, dependencies=[Depends(limit_write)])
async def portal_submit_payment(
    reference: str, background: BackgroundTasks, amount: Decimal = Form(gt=0, max_digits=10, decimal_places=2),
    method: str = Form(min_length=2, max_length=40), paid_on: datetime = Form(),
    transaction_reference: str | None = Form(default=None, max_length=120),
    receipt: UploadFile | None = File(default=None),
    x_access_token: str | None = Header(default=None), db: Session = Depends(get_db),
):
    b = _portal_booking(reference, x_access_token, db)
    s = get_settings(db)
    if method not in s["payment_methods"]:
        raise HTTPException(422, "Unsupported payment method")
    if paid_on.tzinfo is None:
        paid_on = paid_on.replace(tzinfo=timezone.utc)
    stored = await read_validated(receipt, allow_pdf=True) if receipt else None
    try:
        rec = submit_payment(db, b, amount=amount, method=method, paid_on=paid_on,
                             transaction_reference=transaction_reference)
    except BusinessRuleError as e:
        raise HTTPException(422, str(e))
    if stored:
        key = store(db, stored[0], stored[1], stored[2], private=True)
        db.add(PaymentEvidence(payment_id=rec.id, storage_key=key, content_type=stored[1], size_bytes=len(stored[0])))
    db.commit()
    notify.queue(background, [notify.payment_ack(b, rec, s), notify.owner_payment_submitted(b, rec, s)])
    return {"payment_id": rec.id, "payment_status": b.payment_status.value}


@router.get("/portal/{reference}/evidence/{evidence_id}", dependencies=[Depends(limit_lookup)])
def portal_evidence(reference: str, evidence_id: int, x_access_token: str | None = Header(default=None),
                    db: Session = Depends(get_db)):
    b = _portal_booking(reference, x_access_token, db)
    ev = db.scalar(select(PaymentEvidence).join(PaymentRecord)
                   .where(PaymentEvidence.id == evidence_id, PaymentRecord.booking_id == b.id))
    if not ev:
        raise HTTPException(404, "Not found")
    f = load(db, ev.storage_key, private=True)
    return Response(f.data, media_type=f.content_type,
                    headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"})


# ---------- « Renvoyez-moi mes liens » ----------
_resend_hits: dict[str, list[float]] = defaultdict(list)


@router.post("/portal/resend", dependencies=[Depends(RateLimiter(5, 3600, "resend"))])
def resend_links(body: ResendIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Réponse identique que l'email soit connu ou non : on ne révèle jamais l'existence d'un client.
    Limité par adresse (3/heure) pour empêcher d'inonder la boîte d'un tiers."""
    email = body.email.lower()
    now = time.monotonic()
    hits = [t for t in _resend_hits[email] if now - t < 3600]
    _resend_hits[email] = hits
    if len(hits) < 3:
        hits.append(now)
        rows = db.scalars(select(Booking).join(Customer).where(func.lower(Customer.email) == email)
                          .order_by(Booking.id.desc()).limit(10)).all()
        if rows:
            s = get_settings(db)
            notify.queue(background, [notify.link_reminder(email, [(b.reference, notify.portal_link(b.reference)) for b in rows], s)])
    return {"ok": True}
