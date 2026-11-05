"""Logique métier : tarification serveur, création de réservation, paiements."""
from __future__ import annotations

import base64
import hashlib
import hmac
import math
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from .config import settings
from .availability import (
    AvailabilityError, check_availability, ensure_utc, lock_products, purge_expired_holds,
)
from .enums import (
    BookingStatus, FulfillmentMethod, PaymentRecordStatus, PaymentSource, PaymentStatus, PricingUnit,
)
from .models import (
    AuditLog, Booking, BookingItem, Customer, DeliveryRecord, InventoryHold, PaymentRecord, Product,
)

CENT = Decimal("0.01")


class BusinessRuleError(Exception):
    pass


def money(v) -> Decimal:
    return Decimal(v).quantize(CENT, rounding=ROUND_HALF_UP)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def make_access_token(reference: str) -> str:
    """Jeton d'accès client dérivé (HMAC) de la référence et de la clé secrète du serveur.
    Déterministe : on peut ré-émettre le lien d'une réservation sans stocker le jeton en clair.
    Seul son hash est conservé en base ; il est infalsifiable sans la clé secrète."""
    mac = hmac.new(settings.secret_key.encode(), f"booking-access:{reference}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac[:24]).decode().rstrip("=")


def billable_units(unit: PricingUnit, start: datetime, end: datetime) -> int:
    hours = (end - start).total_seconds() / 3600
    if unit == PricingUnit.HOUR:
        return max(1, math.ceil(hours))
    if unit == PricingUnit.DAY:
        return max(1, math.ceil(hours / 24))
    if unit == PricingUnit.WEEKEND:
        return max(1, math.ceil(hours / 72))
    return max(1, math.ceil(hours / (24 * 7)))


def audit(db: Session, user_id: int | None, action: str, entity: str, entity_id: int | None,
          before: dict | None = None, after: dict | None = None) -> None:
    db.add(AuditLog(user_id=user_id, action=action, entity_type=entity, entity_id=entity_id,
                    before=before, after=after))


def _next_reference(db: Session, year: int) -> str:
    # Verrou consultatif transactionnel : sérialise la génération des références.
    db.execute(text("SELECT pg_advisory_xact_lock(7340001)"))
    prefix = f"ELD-{year}-"
    last = db.scalar(select(func.max(Booking.reference)).where(Booking.reference.like(prefix + "%")))
    n = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{prefix}{n:04d}"


def price_items(products: dict[int, Product], items: list[tuple[int, int]], start: datetime, end: datetime):
    lines, subtotal, deposit = [], Decimal("0"), Decimal("0")
    for pid, qty in items:
        p = products[pid]
        units = billable_units(p.pricing_unit, start, end)
        line_total = money(p.unit_price * units * qty)
        line_deposit = money(p.security_deposit * qty)
        subtotal += line_total
        deposit += line_deposit
        lines.append(BookingItem(
            product_id=pid, quantity=qty, product_name=p.name, unit_price=p.unit_price,
            pricing_unit=p.pricing_unit, billable_units=units, deposit=line_deposit, line_total=line_total,
        ))
    return lines, money(subtotal), money(deposit)


def create_booking(
    db: Session, *, items: list[tuple[int, int]], start: datetime, end: datetime, settings: dict,
    customer: dict, fulfillment: FulfillmentMethod, delivery_address: str | None,
    event_type: str | None, instructions: str, hold_token: str | None = None,
    status: BookingStatus = BookingStatus.PENDING_REVIEW,
) -> tuple[Booking, str]:
    """Crée une réservation de façon atomique. Retourne (booking, jeton d'accès en clair)."""
    if not items:
        raise BusinessRuleError("At least one item is required")
    if any(q <= 0 for _, q in items):
        raise BusinessRuleError("Quantities must be positive")
    merged: dict[int, int] = {}
    for pid, q in items:
        merged[pid] = merged.get(pid, 0) + q
    items = sorted(merged.items())
    start, end = ensure_utc(start), ensure_utc(end)
    if fulfillment == FulfillmentMethod.DELIVERY and not (delivery_address or "").strip():
        raise BusinessRuleError("Delivery address required for delivery")

    products = lock_products(db, [pid for pid, _ in items])
    if len(products) != len(items):
        raise BusinessRuleError("Unknown product")
    purge_expired_holds(db)
    results, window = check_availability(
        db, items, start, end, settings, exclude_hold_token=hold_token, products=products
    )
    short = [r for r in results if not r.ok]
    if short:
        raise AvailabilityError(short)
    if hold_token:
        db.execute(delete(InventoryHold).where(InventoryHold.token == hold_token))

    lines, subtotal, deposit = price_items(products, items, start, end)
    delivery_fee = money(settings["delivery_fee"]) if fulfillment == FulfillmentMethod.DELIVERY else money(0)
    total = money(subtotal + delivery_fee + deposit)

    cust = Customer(full_name=customer["full_name"], email=customer["email"].lower(), phone=customer["phone"])
    db.add(cust)
    reference = _next_reference(db, datetime.now(timezone.utc).year)
    token = make_access_token(reference)
    booking = Booking(
        reference=reference, access_token_hash=hash_token(token), customer=cust,
        status=status, start_at=start, end_at=end, blocked_start=window[0], blocked_end=window[1],
        event_type=event_type, instructions=instructions, fulfillment_method=fulfillment,
        subtotal=subtotal, delivery_fee=delivery_fee, deposit_amount=deposit, total=total, items=lines,
    )
    if fulfillment == FulfillmentMethod.DELIVERY:
        booking.delivery = DeliveryRecord(address=delivery_address, delivery_at=start, return_at=end)
    db.add(booking)
    db.flush()
    audit(db, None, "booking.created", "booking", booking.id, after={"reference": booking.reference})
    return booking, token


# Transitions autorisées du statut de réservation (action administrateur)
TRANSITIONS: dict[BookingStatus, set[BookingStatus]] = {
    BookingStatus.PENDING_REVIEW: {BookingStatus.CONFIRMED, BookingStatus.REJECTED, BookingStatus.CANCELLED,
                                   BookingStatus.EXPIRED},
    BookingStatus.CONFIRMED: {BookingStatus.ACTIVE, BookingStatus.CANCELLED},
    BookingStatus.ACTIVE: {BookingStatus.COMPLETED},
    BookingStatus.COMPLETED: set(),
    BookingStatus.REJECTED: set(),
    BookingStatus.CANCELLED: set(),
    BookingStatus.EXPIRED: set(),
}


def change_status(db: Session, booking: Booking, new: BookingStatus, user_id: int | None,
                  reason: str | None = None) -> None:
    if new not in TRANSITIONS[booking.status]:
        raise BusinessRuleError(f"Cannot go from {booking.status.value} to {new.value}")
    before = booking.status
    booking.status = new
    if new == BookingStatus.REJECTED:
        booking.rejection_reason = reason
    audit(db, user_id, "booking.status", "booking", booking.id,
          {"status": before.value}, {"status": new.value})


def expire_stale_pending(db: Session, settings: dict) -> list[Booking]:
    """Passe en « Expired » les demandes non traitées après le délai (48 h par défaut) pour libérer le stock.
    On n'expire jamais une demande pour laquelle le client a déjà soumis ou fait vérifier un paiement : c'est à
    l'administrateur de trancher. À appeler avant les lectures et décisions sensibles (pas de planificateur
    nécessaire en serverless)."""
    from .availability import pending_cutoff

    cutoff = pending_cutoff(settings)
    stale = db.scalars(select(Booking).where(Booking.status == BookingStatus.PENDING_REVIEW,
                                             Booking.created_at <= cutoff).with_for_update(skip_locked=True)).all()
    expired = []
    for b in stale:
        if any(p.status in (PaymentRecordStatus.SUBMITTED, PaymentRecordStatus.VERIFIED) for p in b.payments):
            continue
        change_status(db, b, BookingStatus.EXPIRED, None, "Not reviewed in time")
        expired.append(b)
    return expired


def verified_total(booking: Booking) -> Decimal:
    return money(sum((p.amount for p in booking.payments if p.status == PaymentRecordStatus.VERIFIED),
                     Decimal("0")))


def outstanding_balance(booking: Booking) -> Decimal:
    if booking.status in (BookingStatus.REJECTED, BookingStatus.CANCELLED, BookingStatus.EXPIRED):
        return money(0)
    return max(money(booking.total - verified_total(booking)), money(0))


def recompute_payment_status(booking: Booking) -> PaymentStatus:
    recs = booking.payments
    verified = verified_total(booking)
    if verified >= booking.total and booking.total > 0:
        status = PaymentStatus.VERIFIED
    elif verified > 0:
        status = PaymentStatus.PARTIALLY_PAID
    elif any(p.status == PaymentRecordStatus.SUBMITTED for p in recs):
        status = PaymentStatus.SUBMITTED
    elif recs and all(p.status == PaymentRecordStatus.REFUNDED for p in recs):
        status = PaymentStatus.REFUNDED
    elif recs and any(p.status == PaymentRecordStatus.REJECTED for p in recs):
        status = PaymentStatus.REJECTED
    else:
        status = PaymentStatus.UNPAID
    booking.payment_status = status
    return status


def submit_payment(db: Session, booking: Booking, *, amount: Decimal, method: str, paid_on: datetime,
                   transaction_reference: str | None) -> PaymentRecord:
    """Soumission client : jamais vérifiée automatiquement, ne confirme jamais la réservation."""
    if booking.status in (BookingStatus.REJECTED, BookingStatus.CANCELLED, BookingStatus.EXPIRED):
        raise BusinessRuleError("This booking no longer accepts payments")
    amount = money(amount)
    if amount <= 0:
        raise BusinessRuleError("Amount must be positive")
    pending = sum((p.amount for p in booking.payments if p.status == PaymentRecordStatus.SUBMITTED), Decimal("0"))
    if verified_total(booking) + pending + amount > booking.total:
        raise BusinessRuleError("Amount exceeds the outstanding balance")
    rec = PaymentRecord(booking=booking, amount=amount, method=method, paid_on=ensure_utc(paid_on),
                        transaction_reference=transaction_reference, source=PaymentSource.CUSTOMER)
    db.add(rec)
    db.flush()
    recompute_payment_status(booking)
    audit(db, None, "payment.submitted", "payment", rec.id, after={"amount": str(amount)})
    return rec


def review_payment(db: Session, rec: PaymentRecord, *, user_id: int, approve: bool, notes: str = "") -> None:
    """Seul un administrateur authentifié peut vérifier ou rejeter."""
    if rec.status != PaymentRecordStatus.SUBMITTED:
        raise BusinessRuleError("Only submitted payments can be reviewed")
    before = rec.status
    rec.status = PaymentRecordStatus.VERIFIED if approve else PaymentRecordStatus.REJECTED
    rec.reviewed_by, rec.reviewed_at = user_id, ensure_utc(datetime.now().astimezone())
    rec.admin_notes = notes
    db.flush()
    recompute_payment_status(rec.booking)
    audit(db, user_id, "payment.verified" if approve else "payment.rejected", "payment", rec.id,
          {"status": before.value}, {"status": rec.status.value})


def record_admin_payment(db: Session, booking: Booking, *, user_id: int, amount: Decimal, method: str,
                         paid_on: datetime, cash: bool, notes: str = "") -> PaymentRecord:
    amount = money(amount)
    if amount <= 0:
        raise BusinessRuleError("Amount must be positive")
    if verified_total(booking) + amount > booking.total:
        raise BusinessRuleError("Amount exceeds the outstanding balance")
    rec = PaymentRecord(
        booking=booking, amount=amount, method=method, paid_on=ensure_utc(paid_on),
        status=PaymentRecordStatus.VERIFIED, admin_notes=notes, reviewed_by=user_id,
        reviewed_at=ensure_utc(datetime.now().astimezone()),
        source=PaymentSource.ADMIN_CASH if cash else PaymentSource.ADMIN_EXTERNAL,
    )
    db.add(rec)
    db.flush()
    recompute_payment_status(booking)
    audit(db, user_id, "payment.recorded", "payment", rec.id, after={"amount": str(amount), "cash": cash})
    return rec
