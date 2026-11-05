from zoneinfo import ZoneInfo

from . import whatsapp
from .models import Booking, PaymentRecord
from .services import outstanding_balance, verified_total


def payment_out(p: PaymentRecord) -> dict:
    return {
        "id": p.id, "amount": p.amount, "method": p.method, "paid_on": p.paid_on,
        "transaction_reference": p.transaction_reference, "status": p.status.value,
        "source": p.source.value, "created_at": p.created_at,
        "evidence": [{"id": e.id, "content_type": e.content_type} for e in p.evidence],
    }


def booking_out(b: Booking, settings: dict, *, admin: bool = False) -> dict:
    tz = ZoneInfo(settings["timezone"])
    d = {
        "reference": b.reference, "status": b.status.value, "payment_status": b.payment_status.value,
        "start_at": b.start_at, "end_at": b.end_at, "event_type": b.event_type,
        "instructions": b.instructions, "fulfillment_method": b.fulfillment_method.value,
        "subtotal": b.subtotal, "delivery_fee": b.delivery_fee, "deposit_amount": b.deposit_amount,
        "total": b.total, "verified_total": verified_total(b), "balance": outstanding_balance(b),
        "created_at": b.created_at,
        "customer": {"full_name": b.customer.full_name, "email": b.customer.email, "phone": b.customer.phone},
        "items": [{"product_id": i.product_id, "product_name": i.product_name, "quantity": i.quantity,
                   "unit_price": i.unit_price, "pricing_unit": i.pricing_unit.value,
                   "billable_units": i.billable_units, "deposit": i.deposit, "line_total": i.line_total}
                  for i in b.items],
        "delivery": ({"address": b.delivery.address, "instructions": b.delivery.instructions,
                      "delivery_at": b.delivery.delivery_at, "return_at": b.delivery.return_at,
                      "status": b.delivery.status.value} if b.delivery else None),
        "payments": [payment_out(p) for p in sorted(b.payments, key=lambda p: p.created_at)],
        "whatsapp_url": whatsapp.booking_to_business(settings["whatsapp_number"], b, tz),
    }
    if admin:
        d.update(id=b.id, internal_notes=b.internal_notes, rejection_reason=b.rejection_reason,
                 customer_id=b.customer_id,
                 whatsapp_customer_url=whatsapp.admin_to_customer(b, settings["business_name"]))
    return d
