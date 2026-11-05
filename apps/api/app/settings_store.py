from sqlalchemy.orm import Session

from .models import BusinessSetting

DEFAULTS: dict = {
    "business_name": "Favor Upon You Rentals",
    "contact_email": "",          # public (page Contact)
    "notification_emails": [],    # privé : destinataires des alertes (demandes, paiements), 5 max
    "whatsapp_number": "",  # format international sans "+", ex. 15551234567
    "business_address": "",
    "timezone": "America/New_York",
    "currency": "USD",
    "buffer_before_minutes": 120,
    "buffer_after_minutes": 120,
    "deposit_percentage": 30,
    "delivery_fee": "0.00",
    "delivery_enabled": True,
    "pending_expiry_hours": 48,   # une demande non traitée expire (et libère le stock) après ce délai
    "payment_instructions": "",
    "payment_methods": ["Zelle", "Cash App", "Bank transfer", "Cash"],
    "bank_details": {"bank_name": "", "account_holder": "", "account_number": "", "routing": ""},
    "rental_policies": "",
    "cancellation_policy": "",
    "operating_hours": {},
}


def get_settings(db: Session) -> dict:
    values = dict(DEFAULTS)
    for row in db.query(BusinessSetting).all():
        values[row.key] = row.value
    return values


def set_setting(db: Session, key: str, value) -> None:
    row = db.get(BusinessSetting, key)
    if row:
        row.value = value
    else:
        db.add(BusinessSetting(key=key, value=value))
