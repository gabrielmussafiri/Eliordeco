from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .enums import BookingStatus, FulfillmentMethod, FulfillmentStatus, PricingUnit


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ItemIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=500)


class PeriodIn(BaseModel):
    items: list[ItemIn] = Field(min_length=1, max_length=30)
    start_at: datetime
    end_at: datetime

    @field_validator("start_at", "end_at")
    @classmethod
    def aware(cls, v: datetime):
        if v.tzinfo is None:
            raise ValueError("timezone-aware datetime required")
        return v


class QuoteIn(PeriodIn):
    fulfillment: FulfillmentMethod = FulfillmentMethod.PICKUP


class DaysIn(BaseModel):
    items: list[ItemIn] = Field(min_length=1, max_length=30)
    first_day: date = Field(alias="from")
    days: int = Field(default=42, ge=1, le=70)
    model_config = ConfigDict(populate_by_name=True)


class HoldIn(PeriodIn):
    token: str | None = Field(default=None, min_length=16, max_length=64)


class CustomerIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=40)


class BookingIn(PeriodIn):
    customer: CustomerIn
    fulfillment: FulfillmentMethod = FulfillmentMethod.PICKUP
    delivery_address: str | None = Field(default=None, max_length=500)
    event_type: str | None = Field(default=None, max_length=80)
    instructions: str = Field(default="", max_length=2000)
    hold_token: str | None = Field(default=None, min_length=16, max_length=64)


class AdminBookingIn(BookingIn):
    status: BookingStatus = BookingStatus.CONFIRMED


class ImageOut(ORM):
    id: int
    url: str
    alt: str


class CategoryOut(ORM):
    id: int
    name: str
    slug: str
    sort_order: int


class CategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    sort_order: int = 0


class ProductOut(ORM):
    id: int
    name: str
    slug: str
    description: str
    specifications: dict
    rental_conditions: str
    unit_price: Decimal
    pricing_unit: PricingUnit
    security_deposit: Decimal
    total_quantity: int
    buffer_before_minutes: int | None = None
    buffer_after_minutes: int | None = None
    is_active: bool
    category: CategoryOut | None
    images: list[ImageOut]


class ProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    category_id: int | None = None
    description: str = ""
    specifications: dict = {}
    rental_conditions: str = ""
    unit_price: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    pricing_unit: PricingUnit = PricingUnit.DAY
    security_deposit: Decimal = Field(default=Decimal("0"), ge=0, max_digits=10, decimal_places=2)
    total_quantity: int = Field(ge=0, le=10000)
    buffer_before_minutes: int | None = Field(default=None, ge=0, le=2880)
    buffer_after_minutes: int | None = Field(default=None, ge=0, le=2880)
    is_active: bool = True


class MaintenanceIn(BaseModel):
    product_id: int
    quantity: int = Field(default=1, gt=0)
    start_at: datetime
    end_at: datetime
    reason: str = Field(default="", max_length=200)
    is_damage: bool = False


class StatusIn(BaseModel):
    status: BookingStatus
    reason: str | None = Field(default=None, max_length=1000)


class BookingPatch(BaseModel):
    internal_notes: str | None = Field(default=None, max_length=5000)
    instructions: str | None = Field(default=None, max_length=2000)
    delivery_fee: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)


class RescheduleIn(BaseModel):
    start_at: datetime
    end_at: datetime


class DeliveryPatch(BaseModel):
    address: str | None = Field(default=None, max_length=500)
    instructions: str | None = Field(default=None, max_length=2000)
    delivery_at: datetime | None = None
    return_at: datetime | None = None
    status: FulfillmentStatus | None = None


class ReviewIn(BaseModel):
    approve: bool
    notes: str = Field(default="", max_length=2000)


class AdminPaymentIn(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    method: str = Field(min_length=2, max_length=40)
    paid_on: datetime
    cash: bool = False
    notes: str = Field(default="", max_length=2000)


class CustomerPatch(BaseModel):
    internal_notes: str = Field(max_length=5000)


class PasswordChangeIn(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(min_length=12, max_length=200)


class LoginIn(BaseModel):
    # Pas de validation de format à la connexion : une erreur de forme ne doit pas se distinguer d'un mauvais identifiant.
    email: str = Field(max_length=255)
    password: str = Field(max_length=200)


class ResendIn(BaseModel):
    email: EmailStr
