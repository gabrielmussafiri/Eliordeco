"""Moteur de disponibilité. Toute la logique de stock vit ici, côté serveur.

Principes :
- Chaque réservation bloque [start - tampon_avant, end + tampon_après) ; les
  intervalles sont semi-ouverts, donc deux périodes bout à bout ne se chevauchent pas.
- Le stock restant est calculé par le *pic de concurrence* sur la fenêtre demandée
  (balayage), pas par la somme des chevauchements : deux locations successives à
  l'intérieur d'une longue demande n'occupent pas simultanément le stock.
- Bloquent le stock : réservations pending/confirmed/active, holds non expirés,
  périodes de maintenance.
- La création est sérialisée par produit via SELECT ... FOR UPDATE (ordre d'id
  croissant pour éviter les deadlocks).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import Session

from .enums import BookingStatus, PaymentRecordStatus
from .models import Booking, BookingItem, InventoryHold, MaintenancePeriod, PaymentRecord, Product


class AvailabilityError(Exception):
    def __init__(self, shortages: list["ItemAvailability"]):
        self.shortages = shortages
        super().__init__("Insufficient inventory")


@dataclass
class ItemAvailability:
    product_id: int
    requested: int
    available: int  # unités réellement disponibles sur toute la période
    total: int

    @property
    def ok(self) -> bool:
        return self.requested <= self.available


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        raise ValueError("Naive datetime not allowed; send timezone-aware values")
    return dt.astimezone(timezone.utc)


def blocked_range(start: datetime, end: datetime, before_min: int, after_min: int):
    return start - timedelta(minutes=before_min), end + timedelta(minutes=after_min)


def product_buffers(product: Product, settings: dict) -> tuple[int, int]:
    before = product.buffer_before_minutes
    after = product.buffer_after_minutes
    return (
        settings["buffer_before_minutes"] if before is None else before,
        settings["buffer_after_minutes"] if after is None else after,
    )


def peak_usage(intervals: list[tuple[datetime, datetime, int]], window: tuple[datetime, datetime]) -> int:
    """Quantité maximale utilisée simultanément dans la fenêtre (intervalles semi-ouverts)."""
    ws, we = window
    events: list[tuple[datetime, int]] = []
    for s, e, q in intervals:
        if s < we and e > ws:
            events.append((max(s, ws), q))
            events.append((min(e, we), -q))
    # À instant égal, les fins (-q) passent avant les débuts : bout à bout = pas de conflit.
    events.sort(key=lambda ev: (ev[0], ev[1]))
    cur = peak = 0
    for _, delta in events:
        cur += delta
        peak = max(peak, cur)
    return peak


def min_usage(intervals: list[tuple[datetime, datetime, int]], window: tuple[datetime, datetime]) -> int:
    """Quantité minimale utilisée à un instant de la fenêtre. Si elle dépasse (stock - demandé), plus aucun
    instant de la fenêtre n'offre assez d'unités libres : la journée est « complète »."""
    ws, we = window
    pts = sorted({ws, we, *[min(max(t, ws), we) for s, e, _ in intervals for t in (s, e)]})
    best = None
    for a, b in zip(pts, pts[1:]):
        if a >= b:
            continue
        use = sum(q for s, e, q in intervals if s <= a and e >= b)
        best = use if best is None else min(best, use)
    return best or 0


def pending_cutoff(settings: dict) -> datetime:
    """Une demande « en attente » plus ancienne que ce seuil ne bloque plus le stock (elle va expirer)."""
    return utcnow() - timedelta(hours=float(settings.get("pending_expiry_hours", 48)))


def purge_expired_holds(db: Session) -> int:
    res = db.execute(delete(InventoryHold).where(InventoryHold.expires_at <= utcnow()))
    return res.rowcount or 0


def lock_products(db: Session, product_ids: list[int]) -> dict[int, Product]:
    rows = db.scalars(
        select(Product).where(Product.id.in_(sorted(set(product_ids)))).order_by(Product.id).with_for_update()
    ).all()
    return {p.id: p for p in rows}


def _used_intervals(
    db: Session, product_id: int, window: tuple[datetime, datetime],
    exclude_hold_token: str | None, exclude_booking_id: int | None, cutoff: datetime | None = None,
) -> list[tuple[datetime, datetime, int]]:
    ws, we = window
    out: list[tuple[datetime, datetime, int]] = []

    q = (
        select(Booking.blocked_start, Booking.blocked_end, BookingItem.quantity)
        .join(BookingItem, BookingItem.booking_id == Booking.id)
        .where(
            BookingItem.product_id == product_id,
            or_(Booking.status.in_((BookingStatus.CONFIRMED, BookingStatus.ACTIVE)),
                # En attente : bloque tant qu'elle n'est pas périmée, ou dès qu'un paiement a été soumis/vérifié
                # (dans ce cas elle n'expire jamais seule : à l'administrateur de trancher).
                and_(Booking.status == BookingStatus.PENDING_REVIEW,
                     or_(Booking.created_at > (cutoff if cutoff is not None else datetime.min.replace(tzinfo=timezone.utc)),
                         Booking.payments.any(PaymentRecord.status.in_((PaymentRecordStatus.SUBMITTED, PaymentRecordStatus.VERIFIED)))))),
            Booking.blocked_start < we,
            Booking.blocked_end > ws,
        )
    )
    if exclude_booking_id is not None:
        q = q.where(Booking.id != exclude_booking_id)
    out += [(s, e, n) for s, e, n in db.execute(q)]

    hq = select(InventoryHold.blocked_start, InventoryHold.blocked_end, InventoryHold.quantity).where(
        InventoryHold.product_id == product_id,
        InventoryHold.expires_at > utcnow(),
        InventoryHold.blocked_start < we,
        InventoryHold.blocked_end > ws,
    )
    if exclude_hold_token:
        hq = hq.where(InventoryHold.token != exclude_hold_token)
    out += [(s, e, n) for s, e, n in db.execute(hq)]

    mq = select(MaintenancePeriod.start_at, MaintenancePeriod.end_at, MaintenancePeriod.quantity).where(
        MaintenancePeriod.product_id == product_id,
        MaintenancePeriod.start_at < we,
        MaintenancePeriod.end_at > ws,
    )
    out += [(s, e, n) for s, e, n in db.execute(mq)]
    return out


def check_availability(
    db: Session, items: list[tuple[int, int]], start: datetime, end: datetime, settings: dict,
    *, exclude_hold_token: str | None = None, exclude_booking_id: int | None = None,
    products: dict[int, Product] | None = None,
) -> tuple[list[ItemAvailability], tuple[datetime, datetime]]:
    """Calcule la disponibilité de chaque ligne. À appeler après lock_products pour une écriture."""
    start, end = ensure_utc(start), ensure_utc(end)
    if end <= start:
        raise ValueError("Return must be after start")
    if products is None:
        products = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_([i for i, _ in items])))}
    # Fenêtre du booking = tampons maximaux des produits demandés
    befores, afters = [], []
    for pid, _ in items:
        p = products.get(pid)
        if p:
            b, a = product_buffers(p, settings)
            befores.append(b)
            afters.append(a)
    window = blocked_range(start, end, max(befores, default=0), max(afters, default=0))

    results = []
    for pid, qty in items:
        p = products.get(pid)
        if p is None or not p.is_active:
            results.append(ItemAvailability(pid, qty, 0, 0))
            continue
        used = peak_usage(_used_intervals(db, pid, window, exclude_hold_token, exclude_booking_id,
                                          pending_cutoff(settings)), window)
        results.append(ItemAvailability(pid, qty, max(p.total_quantity - used, 0), p.total_quantity))
    return results, window


def create_hold(
    db: Session, token: str, items: list[tuple[int, int]], start: datetime, end: datetime,
    settings: dict, ttl_minutes: int,
) -> list[ItemAvailability]:
    """Réserve temporairement le stock (remplace tout hold précédent du même token)."""
    products = lock_products(db, [pid for pid, _ in items])
    purge_expired_holds(db)
    db.execute(delete(InventoryHold).where(InventoryHold.token == token))
    results, window = check_availability(db, items, start, end, settings, products=products)
    short = [r for r in results if not r.ok]
    if short:
        raise AvailabilityError(short)
    expires = utcnow() + timedelta(minutes=ttl_minutes)
    for pid, qty in items:
        db.add(InventoryHold(token=token, product_id=pid, quantity=qty,
                             blocked_start=window[0], blocked_end=window[1], expires_at=expires))
    db.flush()
    return results


BOOKABLE_FROM_HOUR, BOOKABLE_TO_HOUR = 7, 22  # créneaux proposés au client (heure locale)


def full_days(db: Session, items: list[tuple[int, int]], first_day, days: int, settings: dict) -> list[str]:
    """Jours (AAAA-MM-JJ, heure locale) où au moins un produit demandé n'a, à aucun moment des créneaux
    réservables, assez d'unités libres pour la quantité souhaitée. Aide d'affichage : la vérification exacte
    d'une période reste faite par check_availability."""
    from datetime import date, time
    from zoneinfo import ZoneInfo

    tz = ZoneInfo(settings["timezone"])
    products = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_([i for i, _ in items])))}
    cutoff = pending_cutoff(settings)
    start = datetime.combine(first_day, time(0), tz).astimezone(timezone.utc)
    end = datetime.combine(first_day + timedelta(days=days), time(0), tz).astimezone(timezone.utc)
    per_item = []
    for pid, qty in items:
        p = products.get(pid)
        if p is None or not p.is_active or qty > p.total_quantity:
            return [(first_day + timedelta(days=n)).isoformat() for n in range(days)]
        per_item.append((p, qty, _used_intervals(db, pid, (start, end), None, None, cutoff)))
    out = []
    for n in range(days):
        d = first_day + timedelta(days=n)
        win = (datetime.combine(d, time(BOOKABLE_FROM_HOUR), tz).astimezone(timezone.utc),
               datetime.combine(d, time(BOOKABLE_TO_HOUR), tz).astimezone(timezone.utc))
        if any(min_usage([iv for iv in ivs if iv[0] < win[1] and iv[1] > win[0]], win) > p.total_quantity - qty
               for p, qty, ivs in per_item):
            out.append(d.isoformat())
    return out
