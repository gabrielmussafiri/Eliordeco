import enum


class BookingStatus(str, enum.Enum):
    PENDING_REVIEW = "pending_review"
    CONFIRMED = "confirmed"
    ACTIVE = "active"
    COMPLETED = "completed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


# Statuts qui bloquent le stock. Rejected / Cancelled / Expired / Completed le libèrent.
BLOCKING_STATUSES = (
    BookingStatus.PENDING_REVIEW,
    BookingStatus.CONFIRMED,
    BookingStatus.ACTIVE,
)


class PaymentStatus(str, enum.Enum):
    UNPAID = "unpaid"
    SUBMITTED = "submitted"
    PARTIALLY_PAID = "partially_paid"
    VERIFIED = "verified"
    REJECTED = "rejected"
    REFUNDED = "refunded"


class PaymentRecordStatus(str, enum.Enum):
    SUBMITTED = "submitted"
    VERIFIED = "verified"
    REJECTED = "rejected"
    REFUNDED = "refunded"


class PaymentSource(str, enum.Enum):
    CUSTOMER = "customer"
    ADMIN_CASH = "admin_cash"
    ADMIN_EXTERNAL = "admin_external"


class PricingUnit(str, enum.Enum):
    HOUR = "hour"
    DAY = "day"
    WEEKEND = "weekend"
    WEEK = "week"


class FulfillmentMethod(str, enum.Enum):
    PICKUP = "pickup"
    DELIVERY = "delivery"


class FulfillmentStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    OUT_FOR_DELIVERY = "out_for_delivery"
    DELIVERED = "delivered"
    RETURN_SCHEDULED = "return_scheduled"
    RETURNED = "returned"


class UserRole(str, enum.Enum):
    OWNER = "owner"
    STAFF = "staff"
