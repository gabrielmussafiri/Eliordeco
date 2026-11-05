from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON, Boolean, LargeBinary, CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer,
    Numeric, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .enums import (
    BookingStatus, FulfillmentMethod, FulfillmentStatus, PaymentRecordStatus,
    PaymentSource, PaymentStatus, PricingUnit, UserRole,
)

Money = Numeric(10, 2)


def _enum(e):
    return Enum(e, values_callable=lambda x: [m.value for m in x], name=e.__name__.lower())


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[UserRole] = mapped_column(_enum(UserRole), default=UserRole.STAFF)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AdminSession(Base):
    __tablename__ = "admin_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Category(Base, TimestampMixin):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Product(Base, TimestampMixin):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("total_quantity >= 0", name="ck_product_qty"),
        CheckConstraint("unit_price >= 0", name="ck_product_price"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(180), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    specifications: Mapped[dict] = mapped_column(JSON, default=dict)
    rental_conditions: Mapped[str] = mapped_column(Text, default="")
    unit_price: Mapped[Decimal] = mapped_column(Money)
    pricing_unit: Mapped[PricingUnit] = mapped_column(_enum(PricingUnit), default=PricingUnit.DAY)
    security_deposit: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    total_quantity: Mapped[int] = mapped_column(Integer, default=1)
    # NULL = utiliser le tampon global des paramètres
    buffer_before_minutes: Mapped[int | None] = mapped_column(Integer)
    buffer_after_minutes: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    category: Mapped[Category | None] = relationship()
    images: Mapped[list[ProductImage]] = relationship(
        back_populates="product", order_by="ProductImage.sort_order", cascade="all, delete-orphan"
    )


class ProductImage(Base):
    __tablename__ = "product_images"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(500))
    alt: Mapped[str] = mapped_column(String(200), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    product: Mapped[Product] = relationship(back_populates="images")


class Customer(Base, TimestampMixin):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), index=True)
    phone: Mapped[str] = mapped_column(String(40))
    internal_notes: Mapped[str] = mapped_column(Text, default="")


class Booking(Base, TimestampMixin):
    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_booking_period"),
        Index("ix_booking_blocked", "blocked_start", "blocked_end"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(20), unique=True)
    # Jeton secret (haché) pour l'accès client sans compte
    access_token_hash: Mapped[str] = mapped_column(String(64))
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    status: Mapped[BookingStatus] = mapped_column(
        _enum(BookingStatus), default=BookingStatus.PENDING_REVIEW, index=True
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(_enum(PaymentStatus), default=PaymentStatus.UNPAID)
    # Toutes les dates en UTC
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Période bloquée = période + tampons (calculée à la création)
    blocked_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    blocked_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    event_type: Mapped[str | None] = mapped_column(String(80))
    instructions: Mapped[str] = mapped_column(Text, default="")
    fulfillment_method: Mapped[FulfillmentMethod] = mapped_column(
        _enum(FulfillmentMethod), default=FulfillmentMethod.PICKUP
    )
    subtotal: Mapped[Decimal] = mapped_column(Money)
    delivery_fee: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    deposit_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Money)
    internal_notes: Mapped[str] = mapped_column(Text, default="")
    rejection_reason: Mapped[str | None] = mapped_column(Text)

    customer: Mapped[Customer] = relationship()
    items: Mapped[list[BookingItem]] = relationship(back_populates="booking", cascade="all, delete-orphan")
    payments: Mapped[list[PaymentRecord]] = relationship(back_populates="booking")
    delivery: Mapped[DeliveryRecord | None] = relationship(back_populates="booking", uselist=False)


class BookingItem(Base):
    __tablename__ = "booking_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_item_qty"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    # Prix historisés : un changement de tarif ne modifie jamais les anciennes réservations
    product_name: Mapped[str] = mapped_column(String(160))
    unit_price: Mapped[Decimal] = mapped_column(Money)
    pricing_unit: Mapped[PricingUnit] = mapped_column(_enum(PricingUnit))
    billable_units: Mapped[int] = mapped_column(Integer)
    deposit: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    line_total: Mapped[Decimal] = mapped_column(Money)
    booking: Mapped[Booking] = relationship(back_populates="items")


class InventoryHold(Base):
    """Blocage temporaire créé pendant le tunnel de réservation ; expire automatiquement."""
    __tablename__ = "inventory_holds"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_hold_qty"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(64), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    blocked_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    blocked_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class MaintenancePeriod(Base, TimestampMixin):
    __tablename__ = "maintenance_periods"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_maint_period"),
        CheckConstraint("quantity > 0", name="ck_maint_qty"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reason: Mapped[str] = mapped_column(String(200), default="")
    is_damage: Mapped[bool] = mapped_column(Boolean, default=False)


class PaymentRecord(Base, TimestampMixin):
    __tablename__ = "payment_records"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_payment_amount"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    method: Mapped[str] = mapped_column(String(40))
    paid_on: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    transaction_reference: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[PaymentRecordStatus] = mapped_column(
        _enum(PaymentRecordStatus), default=PaymentRecordStatus.SUBMITTED, index=True
    )
    source: Mapped[PaymentSource] = mapped_column(_enum(PaymentSource), default=PaymentSource.CUSTOMER)
    admin_notes: Mapped[str] = mapped_column(Text, default="")
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    booking: Mapped[Booking] = relationship(back_populates="payments")
    evidence: Mapped[list[PaymentEvidence]] = relationship(cascade="all, delete-orphan")


class LoginAttempt(Base):
    """Échecs de connexion admin, en base : le blocage tient même si l'API tourne sur plusieurs instances."""
    __tablename__ = "login_attempts"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class StoredFile(Base):
    """Fichier binaire (photo produit publique ou reçu privé). Voir app/storage.py."""
    __tablename__ = "stored_files"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    content_type: Mapped[str] = mapped_column(String(80))
    size_bytes: Mapped[int] = mapped_column(Integer)
    is_private: Mapped[bool] = mapped_column(Boolean, index=True)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PaymentEvidence(Base):
    __tablename__ = "payment_evidence"
    id: Mapped[int] = mapped_column(primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payment_records.id", ondelete="CASCADE"), index=True)
    storage_key: Mapped[str] = mapped_column(String(300))
    content_type: Mapped[str] = mapped_column(String(80))
    size_bytes: Mapped[int] = mapped_column(Integer)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DeliveryRecord(Base, TimestampMixin):
    __tablename__ = "delivery_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), unique=True)
    address: Mapped[str | None] = mapped_column(Text)
    instructions: Mapped[str] = mapped_column(Text, default="")
    delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    return_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[FulfillmentStatus] = mapped_column(
        _enum(FulfillmentStatus), default=FulfillmentStatus.SCHEDULED
    )
    booking: Mapped[Booking] = relationship(back_populates="delivery")


class BusinessSetting(Base):
    __tablename__ = "business_settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict | list | str | int | float | None] = mapped_column(JSON)


class NotificationLog(Base):
    __tablename__ = "notification_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int | None] = mapped_column(ForeignKey("bookings.id", ondelete="SET NULL"))
    channel: Mapped[str] = mapped_column(String(20))
    recipient: Mapped[str] = mapped_column(String(255))
    template: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20))
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    before: Mapped[dict | None] = mapped_column(JSON)
    after: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (Index("ix_audit_entity", "entity_type", "entity_id"),)
