from urllib.parse import quote

from .models import Booking


def link(number: str, message: str) -> str | None:
    digits = "".join(c for c in (number or "") if c.isdigit())
    return f"https://wa.me/{digits}?text={quote(message)}" if digits else None


def product_inquiry(number: str, product_name: str) -> str | None:
    return link(number, f"Hello! I'd like more information about \"{product_name}\".")


def _items(b: Booking) -> str:
    return "\n".join(f"- {i.quantity} x {i.product_name}" for i in b.items)


def booking_to_business(number: str, b: Booking, tz) -> str | None:
    fmt = "%a %b %d, %Y %I:%M %p"
    msg = (
        f"Hello! I just submitted booking request {b.reference}.\n"
        f"Name: {b.customer.full_name}\n"
        f"Equipment:\n{_items(b)}\n"
        f"From: {b.start_at.astimezone(tz).strftime(fmt)}\n"
        f"To: {b.end_at.astimezone(tz).strftime(fmt)}\n"
        f"Total: ${b.total}"
    )
    return link(number, msg)


def admin_to_customer(b: Booking, business_name: str) -> str | None:
    msg = (f"Hello {b.customer.full_name}, this is {business_name} regarding your booking "
           f"{b.reference}. How can we help?")
    return link(b.customer.phone, msg)
