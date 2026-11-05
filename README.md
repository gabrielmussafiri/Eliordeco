# Favor Upon You Rentals

Luxury outdoor umbrella rentals — delivery, setup and pick-up included. Website, booking flow and owner dashboard.

```
apps/api   FastAPI + SQLAlchemy + PostgreSQL   (availability engine, bookings, manual payments, emails)
apps/web   Next.js 16 + Tailwind 4             (storefront, booking portal, /admin dashboard)
```

No online payment is integrated: customers pay outside the site, then submit payment details; the owner verifies
each payment by hand. Availability is computed and enforced by the API (row locks, temporary holds, buffers).

## Run locally

Requirements: Node 20+, Python 3.12+, PostgreSQL 16.

```bash
# API
createdb eliors_deco && createdb eliors_deco_test
cd apps/api
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python seed.py                  # real product only  (add --demo for invented sample products)
.venv/bin/python create_admin.py you@example.com "Your Name"   # prompts for a password (12+ chars)
.venv/bin/uvicorn app.main:app --port 8000
.venv/bin/pytest                          # 25 tests, uses the eliors_deco_test database

# Web (second terminal)
cd apps/web && npm install && npm run build && npx next start -p 3000
```

Open http://localhost:3000 — the dashboard is at http://localhost:3000/admin.

## Configuration

Copy `apps/api/.env.example` to `apps/api/.env`. In production set `ENVIRONMENT=production` and a long random
`SECRET_KEY` (customer booking links are derived from it; the API refuses to start otherwise). Without
`RESEND_API_KEY`, emails are not sent: in development they are printed in the API log and recorded as `logged_only`.

Brand copy, service area and event types live in `apps/web/src/lib/content.ts`. Business settings (WhatsApp number,
bank details, policies, buffers, timezone) are edited by the owner in **Admin → Settings**.

## Before going live

- Replace placeholder values of the "Fringed Umbrella" (price, deposit, stock) in Admin → Inventory.
- Set the real WhatsApp number and contact email in Admin → Settings.
- Configure Resend with a verified domain, `EMAIL_FROM` and `PUBLIC_URL`.
- Product photos and payment receipts use local disk storage; switch `app/storage.py` to S3/Cloudinary for production.
- The rate limiter is in-memory (single instance); use a shared store if the API is replicated.
- Database tables are created with `create_all`; add Alembic migrations before the first schema change in production.
