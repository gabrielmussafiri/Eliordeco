import re
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select

from app import notifications as notify
from app.config import settings as cfg
from app.db import SessionLocal
from app.models import BusinessSetting, NotificationLog
from tests.test_api import H, client, login, payload  # noqa: F401  (fixtures et helpers)

T0 = datetime(2026, 12, 12, 10, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _outbox(client):
    notify.outbox.clear()
    from app.routers import public
    public._resend_hits.clear()
    with SessionLocal() as s:
        s.add(BusinessSetting(key="contact_email", value="owner@studio.test"))
        s.commit()
    yield


def to(addr):
    return [m for m in notify.outbox if m.to == addr]


def test_request_emails_customer_and_owner_with_working_link(client, umbrella):
    body = payload(umbrella)
    body["customer"]["full_name"] = "<script>alert(1)</script> Ana"
    r = client.post("/api/bookings", json=body)
    assert r.status_code == 201
    ref = r.json()["booking"]["reference"]

    cust = to("ana@example.com")
    assert [m.template for m in cust] == ["booking_received"]
    assert ref in cust[0].subject and "No payment has been taken" in cust[0].text
    assert '<meta charset="utf-8">' in cust[0].html and "\u00d7" in cust[0].html
    assert "<script>" not in cust[0].html and "&lt;script&gt;" in cust[0].html  # échappement
    # le lien de l'email ouvre bien la réservation
    token = re.search(r"#t=([\w-]+)", cust[0].text).group(1)
    assert token == r.json()["access_token"]
    assert client.get(f"/api/portal/{ref}", headers={"X-Access-Token": token}).status_code == 200

    owner = to("owner@studio.test")
    assert [m.template for m in owner] == ["owner_new_request"]
    assert f"/admin/bookings/{ref}" in owner[0].text


def test_decisions_and_payment_emails(client, umbrella):
    r = client.post("/api/bookings", json=payload(umbrella)).json()
    ref, tok = r["booking"]["reference"], r["access_token"]
    notify.outbox.clear()

    # paiement client : accusé + alerte propriétaire
    client.post(f"/api/portal/{ref}/payments", headers={"X-Access-Token": tok},
                data={"amount": "30", "method": "Zelle", "paid_on": T0.isoformat()})
    assert [m.template for m in to("ana@example.com")] == ["payment_ack"]
    assert [m.template for m in to("owner@studio.test")] == ["owner_payment_submitted"]
    notify.outbox.clear()

    login(client)
    client.post(f"/api/admin/bookings/{ref}/status", json={"status": "confirmed"}, headers=H)
    assert [m.template for m in to("ana@example.com")] == ["booking_confirmed"]
    notify.outbox.clear()

    pid = client.get("/api/admin/payments?status=submitted").json()[0]["id"]
    client.post(f"/api/admin/payments/{pid}/review", json={"approve": True}, headers=H)
    m = to("ana@example.com")[0]
    assert m.template == "payment_verified" and "$30.00" in m.text
    notify.outbox.clear()

    # un paiement rejeté prévient le client ; l'annulation aussi
    client.post(f"/api/portal/{ref}/payments", headers={"X-Access-Token": tok},
                data={"amount": "10", "method": "Zelle", "paid_on": T0.isoformat()})
    notify.outbox.clear()
    pid2 = client.get("/api/admin/payments?status=submitted").json()[0]["id"]
    client.post(f"/api/admin/payments/{pid2}/review", json={"approve": False, "notes": "INTERNAL-NOTE"}, headers=H)
    assert to("ana@example.com")[0].template == "payment_rejected"
    assert "INTERNAL-NOTE" not in to("ana@example.com")[0].text  # les notes internes ne fuient pas
    notify.outbox.clear()
    client.post(f"/api/admin/bookings/{ref}/status", json={"status": "cancelled", "reason": "SECRET-REASON"}, headers=H)
    m = to("ana@example.com")[0]
    assert m.template == "booking_cancelled" and "SECRET-REASON" not in m.text


def test_rejection_email_never_exposes_internal_reason(client, umbrella):
    ref = client.post("/api/bookings", json=payload(umbrella)).json()["booking"]["reference"]
    notify.outbox.clear()
    login(client)
    client.post(f"/api/admin/bookings/{ref}/status", json={"status": "rejected", "reason": "customer is rude"}, headers=H)
    m = to("ana@example.com")[0]
    assert m.template == "booking_rejected" and "rude" not in m.text + m.html


def test_resend_links_does_not_reveal_accounts_and_is_limited(client, umbrella):
    client.post("/api/bookings", json=payload(umbrella))
    notify.outbox.clear()
    unknown = client.post("/api/portal/resend", json={"email": "nobody@example.com"})
    known = client.post("/api/portal/resend", json={"email": "ANA@example.com"})
    assert unknown.status_code == known.status_code == 200 and unknown.json() == known.json()
    assert to("nobody@example.com") == [] and len(to("ana@example.com")) == 1
    link = re.search(r"https?://\S+#t=[\w-]+", to("ana@example.com")[0].text).group(0)
    assert "/booking/ELD-" in link
    for _ in range(4):
        assert client.post("/api/portal/resend", json={"email": "ana@example.com"}).status_code in (200, 429)
    assert len(to("ana@example.com")) <= 3  # plafond par adresse : pas d'inondation de boîte mail


def test_provider_failure_never_breaks_booking_and_is_logged(client, umbrella, monkeypatch):
    monkeypatch.setattr(cfg, "resend_api_key", "re_test")

    def boom(*a, **k):
        raise httpx.ConnectError("down")
    monkeypatch.setattr(httpx, "post", boom)
    r = client.post("/api/bookings", json=payload(umbrella))
    assert r.status_code == 201
    with SessionLocal() as s:
        logs = s.scalars(select(NotificationLog)).all()
    assert logs and all(l.status == "failed" for l in logs)


def test_provider_receives_expected_payload(client, umbrella, monkeypatch):
    monkeypatch.setattr(cfg, "resend_api_key", "re_test")
    seen = []

    class R:
        status_code = 200
        text = "{}"
    monkeypatch.setattr(httpx, "post", lambda url, **kw: (seen.append((url, kw)), R())[1])
    client.post("/api/bookings", json=payload(umbrella))
    assert seen and seen[0][0] == "https://api.resend.com/emails"
    kw = seen[0][1]
    assert kw["headers"]["Authorization"] == "Bearer re_test" and kw["json"]["to"] == ["ana@example.com"]
    with SessionLocal() as s:
        assert {l.status for l in s.scalars(select(NotificationLog))} == {"sent"}


def test_alerts_go_to_every_listed_address_and_stay_private(client, umbrella):
    login(client)
    r = client.put("/api/admin/settings", headers=H, json={"notification_emails": ["One@gmail.com", "two@gmail.com", "one@gmail.com"]})
    assert r.status_code == 200 and r.json()["notification_emails"] == ["one@gmail.com", "two@gmail.com"]  # dédoublonné
    assert client.put("/api/admin/settings", headers=H, json={"notification_emails": ["not-an-email"]}).status_code == 422
    assert client.put("/api/admin/settings", headers=H, json={"notification_emails": [f"a{i}@x.com" for i in range(6)]}).status_code == 422
    notify.outbox.clear()
    client.post("/api/bookings", json=payload(umbrella))
    got = {m.to for m in notify.outbox if m.template == "owner_new_request"}
    assert got == {"one@gmail.com", "two@gmail.com"}            # un message par adresse, et plus l'email de contact
    assert "owner@studio.test" not in got
    assert "one@gmail.com" not in client.get("/api/settings/public").text  # jamais exposées au public
