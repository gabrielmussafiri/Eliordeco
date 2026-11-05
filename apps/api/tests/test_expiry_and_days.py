from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app import notifications as notify
from app.db import SessionLocal
from tests.test_api import H, client, login, payload  # noqa: F401
from tests.test_emails import _outbox, to  # noqa: F401  (fixture autouse + helper)

FROM = "2026-12-10"
# Fuseau par défaut du test : America/New_York (UTC-5 en décembre). 07:00-22:00 locales = 12:00Z -> 03:00Z (J+1)


def days(client, umbrella, qty=1, n=5):
    r = client.post("/api/availability/days", json={"items": [{"product_id": umbrella.id, "quantity": qty}], "from": FROM, "days": n})
    assert r.status_code == 200, r.text
    return r.json()["full"]


def book(client, umbrella, start, end, qty=1, name="Ana"):
    body = {"items": [{"product_id": umbrella.id, "quantity": qty}], "start_at": start, "end_at": end,
            "customer": {"full_name": name, "email": f"{name.lower()}@example.com", "phone": "15550001111"}}
    return client.post("/api/bookings", json=body)


def test_full_days_marks_only_days_without_any_free_slot(client, umbrella):
    assert days(client, umbrella) == []
    # une seule unité réservée de 9h à 12h le 12 : il reste de la place l'après-midi -> pas « complet »
    assert book(client, umbrella, "2026-12-12T14:00:00Z", "2026-12-12T17:00:00Z").status_code == 201
    assert "2026-12-12" not in days(client, umbrella)
    # réservation couvrant toute la plage réservable (7h-22h locales) le 14 -> jour complet, les voisins non
    assert book(client, umbrella, "2026-12-14T12:00:00Z", "2026-12-15T03:00:00Z", name="Bob").status_code == 201
    assert days(client, umbrella) == ["2026-12-14"]


def test_full_days_depends_on_quantity_and_stock(client, umbrella):
    from app.models import Product
    with SessionLocal() as s:
        s.get(Product, umbrella.id).total_quantity = 3
        s.commit()
    assert book(client, umbrella, "2026-12-12T12:00:00Z", "2026-12-13T03:00:00Z", qty=2).status_code == 201
    assert days(client, umbrella, qty=1) == []                       # il en reste 1
    assert days(client, umbrella, qty=2) == ["2026-12-12"]            # pas assez pour 2
    assert days(client, umbrella, qty=9) == [f"2026-12-{d}" for d in range(10, 15)]  # plus que le stock
    # un produit inconnu ou masqué est considéré indisponible plutôt que d'induire en erreur
    r = client.post("/api/availability/days", json={"items": [{"product_id": 9999, "quantity": 1}], "from": FROM, "days": 2})
    assert r.json()["full"] == ["2026-12-10", "2026-12-11"]


def age(ref, hours):
    with SessionLocal() as s:
        s.execute(text("UPDATE bookings SET created_at = now() - make_interval(hours => :h) WHERE reference = :r"), {"h": hours, "r": ref})
        s.commit()


def test_stale_pending_stops_blocking_then_expires_and_notifies(client, umbrella):
    first = book(client, umbrella, "2026-12-12T14:00:00Z", "2026-12-12T20:00:00Z", name="Ana").json()
    ref = first["booking"]["reference"]
    assert book(client, umbrella, "2026-12-12T14:00:00Z", "2026-12-12T20:00:00Z", name="Bob").status_code == 409  # frais : bloque
    age(ref, 47)
    assert book(client, umbrella, "2026-12-12T14:00:00Z", "2026-12-12T20:00:00Z", name="Bob").status_code == 409  # 47 h : bloque encore
    # après 48 h elle ne bloque plus : un autre client peut réserver, et elle est marquée expirée
    age(ref, 49)
    notify.outbox.clear()
    assert book(client, umbrella, "2026-12-12T14:00:00Z", "2026-12-12T20:00:00Z", name="Bob").status_code == 201
    login(client)
    assert client.get(f"/api/admin/bookings/{ref}").json()["status"] == "expired"
    assert [m.template for m in to("ana@example.com")] == ["booking_expired"]
    assert "nothing was charged" in to("ana@example.com")[0].text


def test_cannot_approve_a_request_that_expired(client, umbrella):
    ref = book(client, umbrella, "2026-12-12T14:00:00Z", "2026-12-12T20:00:00Z").json()["booking"]["reference"]
    age(ref, 60)
    book(client, umbrella, "2026-12-12T14:00:00Z", "2026-12-12T20:00:00Z", name="Bob")   # prend la place libérée
    login(client)
    r = client.post(f"/api/admin/bookings/{ref}/status", json={"status": "confirmed"}, headers=H)
    assert r.status_code == 409          # pas de double réservation par une approbation tardive


def test_request_with_a_submitted_payment_never_expires_or_frees_stock(client, umbrella):
    r = book(client, umbrella, "2026-12-12T14:00:00Z", "2026-12-12T20:00:00Z").json()
    ref, tok = r["booking"]["reference"], r["access_token"]
    client.post(f"/api/portal/{ref}/payments", headers={"X-Access-Token": tok},
                data={"amount": "10", "method": "Zelle", "paid_on": datetime(2026, 11, 5, tzinfo=timezone.utc).isoformat()})
    age(ref, 100)
    assert book(client, umbrella, "2026-12-12T14:00:00Z", "2026-12-12T20:00:00Z", name="Bob").status_code == 409
    login(client)
    assert client.get(f"/api/admin/bookings/{ref}").json()["status"] == "pending_review"


def test_expiry_window_is_configurable_and_public(client, umbrella):
    login(client)
    assert client.put("/api/admin/settings", headers=H, json={"pending_expiry_hours": 0}).status_code == 422
    assert client.put("/api/admin/settings", headers=H, json={"pending_expiry_hours": 24}).status_code == 200
    assert client.get("/api/settings/public").json()["pending_expiry_hours"] == 24
    ref = book(client, umbrella, "2026-12-12T14:00:00Z", "2026-12-12T20:00:00Z").json()["booking"]["reference"]
    age(ref, 25)
    assert book(client, umbrella, "2026-12-12T14:00:00Z", "2026-12-12T20:00:00Z", name="Bob").status_code == 201
