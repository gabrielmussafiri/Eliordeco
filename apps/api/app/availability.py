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

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .enums import BLOCKING_STATUSES
from .models import Booking, BookingItem, InventoryHold, MaintenancePeriod, Product


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
    exclude_hold_token: str | None, exclude_booking_id: int | None,
) -> list[tuple[datetime, datetime, int]]:
    ws, we = window
    out: list[tuple[datetime, datetime, int]] = []

    q = (
        select(Booking.blocked_start, Booking.blocked_end, BookingItem.quantity)
        .join(BookingItem, BookingItem.booking_id == Booking.id)
        .where(
            BookingItem.product_id == product_id,
            Booking.status.in_(BLOCKING_STATUSES),
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
        used = peak_usage(_used_intervals(db, pid, window, exclude_hold_token, exclude_booking_id), window)
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
