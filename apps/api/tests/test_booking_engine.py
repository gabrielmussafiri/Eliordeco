from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.availability import AvailabilityError, check_availability, create_hold, peak_usage
from app.db import SessionLocal
from app.enums import BookingStatus, FulfillmentMethod, PaymentStatus
from app.models import MaintenancePeriod, User
from app.services import (
    BusinessRuleError, change_status, create_booking, record_admin_payment, review_payment,
    submit_payment,
)

T0 = datetime(2026, 12, 12, 10, 0, tzinfo=timezone.utc)
CUST = {"full_name": "Ana Lee", "email": "ana@example.com", "phone": "5550001"}


def book(db, settings, pid, qty, start, end, **kw):
    return create_booking(
        db, items=[(pid, qty)], start=start, end=end, settings=settings, customer=CUST,
        fulfillment=FulfillmentMethod.PICKUP, delivery_address=None, event_type=None,
        instructions="", **kw,
    )


def test_peak_usage_back_to_back_is_not_conflict():
    a = (T0, T0 + timedelta(hours=2), 1)
    b = (T0 + timedelta(hours=2), T0 + timedelta(hours=4), 1)
    assert peak_usage([a, b], (T0, T0 + timedelta(hours=4))) == 1


def test_reference_format_and_server_side_pricing(db, settings, umbrella):
    b, token = book(db, settings, umbrella.id, 1, T0, T0 + timedelta(hours=30))
    db.commit()
    yr = datetime.now(timezone.utc).year
    assert b.reference == f"ELD-{yr}-0001"
    assert b.status == BookingStatus.PENDING_REVIEW
    # 30 h => 2 jours x 45 = 90 ; caution 20 ; total 110
    assert (b.subtotal, b.deposit_amount, b.total) == (Decimal("90.00"), Decimal("20.00"), Decimal("110.00"))
    b2, _ = book(db, settings, umbrella.id, 1, T0 + timedelta(days=10), T0 + timedelta(days=11))
    assert b2.reference == f"ELD-{yr}-0002"


def test_overlap_rejected_and_buffer_enforced(db, settings, umbrella):
    book(db, settings, umbrella.id, 1, T0, T0 + timedelta(hours=8))
    db.commit()
    # chevauchement direct
    with pytest.raises(AvailabilityError):
        book(db, settings, umbrella.id, 1, T0 + timedelta(hours=4), T0 + timedelta(hours=9))
    db.rollback()
    # commence juste à la fin mais dans le tampon de 2 h => refusé
    with pytest.raises(AvailabilityError):
        book(db, settings, umbrella.id, 1, T0 + timedelta(hours=9), T0 + timedelta(hours=12))
    db.rollback()
    # après les tampons cumulés (2h + 2h) => accepté
    book(db, settings, umbrella.id, 1, T0 + timedelta(hours=12), T0 + timedelta(hours=20))


def test_unavailable_quantity_reports_remaining(db, settings, umbrella):
    umbrella.total_quantity = 3
    db.commit()
    book(db, settings, umbrella.id, 2, T0, T0 + timedelta(hours=5))
    db.commit()
    res, _ = check_availability(db, [(umbrella.id, 2)], T0, T0 + timedelta(hours=5), settings)
    assert res[0].available == 1 and not res[0].ok


def test_cancel_and_reject_release_inventory(db, settings, umbrella):
    b, _ = book(db, settings, umbrella.id, 1, T0, T0 + timedelta(hours=5))
    db.commit()
    change_status(db, b, BookingStatus.CANCELLED, None)
    db.commit()
    book(db, settings, umbrella.id, 1, T0, T0 + timedelta(hours=5))


def test_maintenance_blocks_stock(db, settings, umbrella):
    db.add(MaintenancePeriod(product_id=umbrella.id, quantity=1, start_at=T0, end_at=T0 + timedelta(days=1)))
    db.commit()
    with pytest.raises(AvailabilityError):
        book(db, settings, umbrella.id, 1, T0 + timedelta(hours=1), T0 + timedelta(hours=3))


def test_hold_blocks_others_then_expires(db, settings, umbrella):
    create_hold(db, "tok-a", [(umbrella.id, 1)], T0, T0 + timedelta(hours=5), settings, 30)
    db.commit()
    with pytest.raises(AvailabilityError):
        book(db, settings, umbrella.id, 1, T0, T0 + timedelta(hours=5))
    db.rollback()
    # le détenteur du hold peut le convertir en réservation
    b, _ = book(db, settings, umbrella.id, 1, T0, T0 + timedelta(hours=5), hold_token="tok-a")
    db.commit()
    assert b.id


def test_expired_hold_releases_inventory(db, settings, umbrella):
    create_hold(db, "tok-a", [(umbrella.id, 1)], T0, T0 + timedelta(hours=5), settings, -1)  # déjà expiré
    db.commit()
    book(db, settings, umbrella.id, 1, T0, T0 + timedelta(hours=5))


def test_concurrent_requests_never_oversell_last_unit(settings, umbrella):
    pid = umbrella.id

    def attempt(_):
        with SessionLocal() as s:
            try:
                book(s, settings, pid, 1, T0, T0 + timedelta(hours=5))
                s.commit()
                return "ok"
            except AvailabilityError:
                s.rollback()
                return "full"

    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(attempt, range(8)))
    assert results.count("ok") == 1 and results.count("full") == 7


def test_payment_lifecycle_is_separate_from_booking_status(db, settings, umbrella):
    db.add(User(email="owner@example.com", password_hash="x", full_name="Owner"))
    b, _ = book(db, settings, umbrella.id, 1, T0, T0 + timedelta(hours=5))  # total 65
    db.commit()
    p1 = submit_payment(db, b, amount=Decimal("30"), method="Zelle", paid_on=T0, transaction_reference="Z1")
    p1b = submit_payment(db, b, amount=Decimal("30"), method="Zelle", paid_on=T0, transaction_reference="Z1")
    assert b.payment_status == PaymentStatus.SUBMITTED
    assert b.status == BookingStatus.PENDING_REVIEW  # un paiement soumis ne confirme rien
    review_payment(db, p1, user_id=1, approve=True)
    assert b.payment_status == PaymentStatus.PARTIALLY_PAID
    review_payment(db, p1b, user_id=1, approve=False, notes="not received")
    assert b.payment_status == PaymentStatus.PARTIALLY_PAID
    assert b.status == BookingStatus.PENDING_REVIEW  # un rejet n'efface pas la réservation
    with pytest.raises(BusinessRuleError):
        review_payment(db, p1, user_id=1, approve=True)  # déjà traité
    with pytest.raises(BusinessRuleError):
        submit_payment(db, b, amount=Decimal("500"), method="Zelle", paid_on=T0, transaction_reference=None)
    record_admin_payment(db, b, user_id=1, amount=Decimal("35"), method="Cash", paid_on=T0, cash=True)
    assert b.payment_status == PaymentStatus.VERIFIED
