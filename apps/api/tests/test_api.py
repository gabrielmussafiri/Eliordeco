import io
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.enums import UserRole
from app.main import app
from app.models import BusinessSetting, User
from app.security import hash_password

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
H = {"X-Requested-With": "eld"}
T0 = datetime(2026, 12, 12, 10, 0, tzinfo=timezone.utc)


@pytest.fixture
def client(umbrella):
    with SessionLocal() as s:
        s.add(User(email="owner@example.com", full_name="Owner", role=UserRole.OWNER,
                   password_hash=hash_password("correct-horse-battery")))
        s.add(User(email="staff@example.com", full_name="Staff", role=UserRole.STAFF,
                   password_hash=hash_password("correct-horse-battery")))
        s.add(BusinessSetting(key="bank_details", value={"bank_name": "SECRETBANK", "account_number": "999"}))
        s.add(BusinessSetting(key="whatsapp_number", value="15551234567"))
        s.commit()
    from app.routers import admin, public
    for rl in (admin.limit_login, public.limit_write, public.limit_lookup):
        rl.hits.clear()
    return TestClient(app)


def login(c, email="owner@example.com"):
    r = c.post("/api/admin/login", json={"email": email, "password": "correct-horse-battery"})
    assert r.status_code == 200, r.text


def payload(umbrella, qty=1, hours=5, offset=0):
    s = T0 + timedelta(days=offset)
    return {"items": [{"product_id": umbrella.id, "quantity": qty}], "start_at": s.isoformat(),
            "end_at": (s + timedelta(hours=hours)).isoformat(),
            "customer": {"full_name": "Ana Lee", "email": "ana@example.com", "phone": "15550001111"}}


def test_admin_routes_require_auth_and_csrf(client):
    assert client.get("/api/admin/bookings").status_code == 401
    assert client.post("/api/admin/login", json={"email": "owner@example.com", "password": "bad"}).status_code == 401
    login(client)
    assert client.get("/api/admin/bookings").status_code == 200
    assert client.post("/api/admin/categories", json={"name": "Tables"}).status_code == 403  # pas d'en-tête CSRF
    assert client.post("/api/admin/categories", json={"name": "Tables"}, headers=H).status_code == 201


def test_staff_cannot_change_settings(client):
    login(client, "staff@example.com")
    assert client.put("/api/admin/settings", json={"deposit_percentage": 10}, headers=H).status_code == 403
    login(client, "owner@example.com")
    assert client.put("/api/admin/settings", json={"deposit_percentage": 10}, headers=H).status_code == 200
    assert client.put("/api/admin/settings", json={"bogus": 1}, headers=H).status_code == 422


def test_public_never_leaks_bank_details(client):
    r = client.get("/api/settings/public")
    assert "SECRETBANK" not in r.text and r.json()["whatsapp_number"] == "15551234567"


def test_full_customer_flow_and_isolation(client, umbrella):
    r = client.post("/api/bookings", json=payload(umbrella))
    assert r.status_code == 201, r.text
    ref, token = r.json()["booking"]["reference"], r.json()["access_token"]
    assert ref == f"ELD-{datetime.now(timezone.utc).year}-0001" and r.json()["booking"]["status"] == "pending_review"
    assert "wa.me/15551234567" in r.json()["booking"]["whatsapp_url"] and ref in r.json()["booking"]["whatsapp_url"]
    # dernier parasol pris -> disponibilité honnête + 409
    av = client.post("/api/availability", json=payload(umbrella)).json()
    assert av["available"] is False and av["items"][0]["available"] == 0
    assert client.post("/api/bookings", json=payload(umbrella)).status_code == 409
    # portail : bon jeton OK, mauvais jeton / absent = 404 identique
    ok = client.get(f"/api/portal/{ref}", headers={"X-Access-Token": token})
    assert ok.status_code == 200 and ok.json()["payment_info"]["bank_details"]["bank_name"] == "SECRETBANK"
    assert client.get(f"/api/portal/{ref}", headers={"X-Access-Token": "x" * 20}).status_code == 404
    assert client.get(f"/api/portal/{ref}").status_code == 404
    assert client.get("/api/portal/ELD-2026-9999", headers={"X-Access-Token": token}).status_code == 404
    # 2e client : ne voit pas la 1re réservation
    r2 = client.post("/api/bookings", json=payload(umbrella, offset=10)).json()
    assert client.get(f"/api/portal/{ref}", headers={"X-Access-Token": r2["access_token"]}).status_code == 404

    # paiement client avec reçu
    pay = client.post(f"/api/portal/{ref}/payments", headers={"X-Access-Token": token},
                      data={"amount": "30", "method": "Zelle", "paid_on": T0.isoformat(), "transaction_reference": "Z1"},
                      files={"receipt": ("r.png", io.BytesIO(PNG), "image/png")})
    assert pay.status_code == 201 and pay.json()["payment_status"] == "submitted"
    detail = client.get(f"/api/portal/{ref}", headers={"X-Access-Token": token}).json()
    assert detail["status"] == "pending_review" and detail["verified_total"] == 0
    ev_id = detail["payments"][0]["evidence"][0]["id"]
    assert client.get(f"/api/portal/{ref}/evidence/{ev_id}", headers={"X-Access-Token": token}).status_code == 200
    assert client.get(f"/api/portal/{ref}/evidence/{ev_id}", headers={"X-Access-Token": r2["access_token"]}).status_code == 404
    assert client.get(f"/api/admin/evidence/{ev_id}").status_code == 401  # client anonyme

    # admin vérifie
    login(client)
    pid = client.get("/api/admin/payments?status=submitted").json()[0]["id"]
    rv = client.post(f"/api/admin/payments/{pid}/review", json={"approve": True}, headers=H)
    assert rv.json()["booking_payment_status"] == "partially_paid"
    assert client.get(f"/api/admin/evidence/{ev_id}").status_code == 200
    d = client.get("/api/admin/dashboard").json()
    assert d["pending"] == 2 and float(d["monthly_revenue"]) == 0.0  # paiement daté en déc., pas ce mois-ci
    assert client.post(f"/api/admin/bookings/{ref}/status", json={"status": "confirmed"}, headers=H).status_code == 200
    assert client.post(f"/api/admin/bookings/{ref}/status", json={"status": "pending_review"}, headers=H).status_code == 409


def test_upload_validation(client, umbrella):
    r = client.post("/api/bookings", json=payload(umbrella)).json()
    ref, tok = r["booking"]["reference"], r["access_token"]
    base = dict(headers={"X-Access-Token": tok}, data={"amount": "10", "method": "Zelle", "paid_on": T0.isoformat()})
    bad = client.post(f"/api/portal/{ref}/payments", **base, files={"receipt": ("x.png", io.BytesIO(b"<script>alert(1)</script>"), "image/png")})
    assert bad.status_code == 415
    big = client.post(f"/api/portal/{ref}/payments", **base, files={"receipt": ("x.png", io.BytesIO(PNG + b"0" * (5 * 1024 * 1024)), "image/png")})
    assert big.status_code == 413
    over = client.post(f"/api/portal/{ref}/payments", headers=base["headers"], data={**base["data"], "amount": "9999"})
    assert over.status_code == 422


def test_admin_manual_booking_cancel_reschedule(client, umbrella):
    login(client)
    r = client.post("/api/admin/bookings", json={**payload(umbrella), "status": "confirmed"}, headers=H)
    assert r.status_code == 201 and r.json()["status"] == "confirmed"
    ref = r.json()["reference"]
    assert "wa.me/15550001111" in r.json()["whatsapp_customer_url"]
    # reprogrammer sur un créneau libre
    new = {"start_at": (T0 + timedelta(days=5)).isoformat(), "end_at": (T0 + timedelta(days=7)).isoformat()}
    rs = client.post(f"/api/admin/bookings/{ref}/reschedule", json=new, headers=H)
    assert rs.status_code == 200 and rs.json()["items"][0]["billable_units"] == 2
    client.post(f"/api/admin/bookings/{ref}/status", json={"status": "cancelled"}, headers=H)
    assert client.post("/api/bookings", json=payload(umbrella, offset=5, hours=48)).status_code == 201  # stock libéré


def test_customer_data_not_in_public_endpoints(client, umbrella):
    client.post("/api/bookings", json=payload(umbrella))
    for url in ("/api/products", "/api/categories", "/api/settings/public"):
        assert "ana@example.com" not in client.get(url).text


def test_quote_is_server_calculated(client, umbrella):
    body = {**payload(umbrella, qty=1, hours=30), "fulfillment": "delivery"}
    body.pop("customer")
    r = client.post("/api/quote", json=body)
    assert r.status_code == 200, r.text
    q = r.json()
    assert (q["subtotal"], q["deposit_amount"], q["delivery_fee"], q["total"]) == (90, 20, 0, 110)
    assert q["lines"][0]["billable_units"] == 2
    bad = {**body, "items": [{"product_id": 9999, "quantity": 1}]}
    assert client.post("/api/quote", json=bad).status_code == 422
    # un devis ne réserve rien
    assert client.post("/api/availability", json=body).json()["available"] is True


def test_public_categories_hide_empty_or_hidden_shelves(client, umbrella):
    from app.models import Category, Product
    with SessionLocal() as s:
        s.add(Category(name="Empty Shelf", slug="empty-shelf"))
        hidden = Category(name="Hidden Shelf", slug="hidden-shelf")
        s.add(hidden)
        s.flush()
        s.add(Product(name="Ghost", slug="ghost", category_id=hidden.id, unit_price=5, total_quantity=1, is_active=False))
        s.commit()
    assert [c["name"] for c in client.get("/api/categories").json()] == ["Outdoor Umbrellas"]
    login(client)
    assert {c["name"] for c in client.get("/api/admin/categories").json()} == {"Outdoor Umbrellas", "Empty Shelf", "Hidden Shelf"}
    assert client.get("/api/admin/categories", headers={}).status_code == 200


def test_media_serves_public_photos_only_and_never_receipts(client, umbrella):
    from app.models import ProductImage
    from app.storage import store
    with SessionLocal() as s:
        photo = store(s, PNG, "image/png", ".png", private=False)
        secret = store(s, PNG, "image/png", ".png", private=True)
        s.add(ProductImage(product_id=umbrella.id, url=f"/media/{photo}", alt="x"))
        s.commit()
    r = client.get(f"/media/{photo}")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert "immutable" in r.headers["cache-control"] and r.headers["x-content-type-options"] == "nosniff"
    assert client.get(f"/media/{secret}").status_code == 404   # un reçu n'est jamais public
    assert client.get("/media/does-not-exist.png").status_code == 404


def test_admin_photo_upload_is_stored_and_served(client, umbrella):
    login(client)
    r = client.post(f"/api/admin/products/{umbrella.id}/images", headers=H, files={"file": ("a.png", io.BytesIO(PNG), "image/png")})
    assert r.status_code == 201
    assert client.get(r.json()["url"]).content == PNG
    bad = client.post(f"/api/admin/products/{umbrella.id}/images", headers=H, files={"file": ("a.png", io.BytesIO(b"%PDF-1.4 x"), "image/png")})
    assert bad.status_code == 415   # un PDF n'est pas une photo produit


def test_login_lockout_survives_across_requests_and_resets_per_account(client):
    from app.routers import admin as adm
    adm.limit_login.hits.clear()
    for _ in range(adm.LOCKOUT_FAILURES):
        adm.limit_login.hits.clear()   # isole le blocage en base du limiteur mémoire
        assert client.post("/api/admin/login", json={"email": "owner@example.com", "password": "wrong"}).status_code == 401
    adm.limit_login.hits.clear()
    # même avec le bon mot de passe, le compte est verrouillé : un attaquant ne peut pas deviner en boucle
    assert client.post("/api/admin/login", json={"email": "owner@example.com", "password": "correct-horse-battery"}).status_code == 429
    # un autre compte n'est pas affecté
    assert client.post("/api/admin/login", json={"email": "staff@example.com", "password": "correct-horse-battery"}).status_code == 200


def test_change_password_flow(client):
    login(client)
    url = "/api/admin/password"
    ok_pw = "a-brand-new-passphrase-42"
    assert client.post(url, json={"current_password": "wrong", "new_password": ok_pw}, headers=H).status_code == 400
    assert client.post(url, json={"current_password": "correct-horse-battery", "new_password": "short"}, headers=H).status_code == 422
    assert client.post(url, json={"current_password": "correct-horse-battery", "new_password": "correct-horse-battery"}, headers=H).status_code == 422
    assert client.post(url, json={"current_password": "correct-horse-battery", "new_password": "owner-owner-owner-1"}, headers=H).status_code == 422
    assert client.post(url, json={"current_password": "correct-horse-battery", "new_password": ok_pw}).status_code == 403  # CSRF
    # une autre session du même compte sera fermée
    other = TestClient(app); login(other)
    assert other.get("/api/admin/me").status_code == 200
    assert client.post(url, json={"current_password": "correct-horse-battery", "new_password": ok_pw}, headers=H).status_code == 200
    assert client.get("/api/admin/me").status_code == 200          # la session courante reste ouverte
    assert other.get("/api/admin/me").status_code == 401           # l'autre est déconnectée
    fresh = TestClient(app)
    assert fresh.post("/api/admin/login", json={"email": "owner@example.com", "password": "correct-horse-battery"}).status_code == 401
    assert fresh.post("/api/admin/login", json={"email": "owner@example.com", "password": ok_pw}).status_code == 200
    assert TestClient(app).post(url, json={"current_password": "x", "new_password": ok_pw}, headers=H).status_code == 401  # non connecté
