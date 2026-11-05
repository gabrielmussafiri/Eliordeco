"""Emails transactionnels (Resend). Sans clé d'API, rien n'est envoyé : les messages sont
conservés dans `outbox` (développement/tests) et journalisés avec le statut « logged_only »."""
from __future__ import annotations

import html as _html
from dataclasses import dataclass
from zoneinfo import ZoneInfo

import httpx

from .config import settings as cfg
from .db import SessionLocal
from .models import Booking, NotificationLog, PaymentRecord
from .services import make_access_token

IVORY, ESPRESSO, OLIVE, MUTED, LINE = "#F8F6F1", "#29251F", "#555C45", "#6A6154", "#DDD6C8"


@dataclass
class Message:
    to: str
    subject: str
    text: str
    html: str
    template: str
    booking_id: int | None = None


outbox: list[Message] = []  # uniquement quand aucun fournisseur n'est configuré


def deliver(msg: Message) -> None:
    """Envoi + journal. Ne lève jamais : un email en échec ne doit pas casser une réservation."""
    status, error = "sent", None
    if cfg.resend_api_key:
        try:
            r = httpx.post(
                "https://api.resend.com/emails", timeout=10,
                headers={"Authorization": f"Bearer {cfg.resend_api_key}"},
                json={"from": cfg.email_from, "to": [msg.to], "subject": msg.subject, "html": msg.html, "text": msg.text},
            )
            if r.status_code >= 300:
                status, error = "failed", f"HTTP {r.status_code}: {r.text[:300]}"
        except Exception as e:  # réseau, délai dépassé…
            status, error = "failed", str(e)[:300]
    else:
        outbox.append(msg)
        del outbox[:-200]
        status = "logged_only"
        if cfg.environment == "development":  # visible dans le journal de l'API pour le développement
            print(f"\n--- EMAIL (not sent: no RESEND_API_KEY) ---\nTo: {msg.to}\nSubject: {msg.subject}\n\n{msg.text}\n---", flush=True)
    try:
        with SessionLocal() as db:
            db.add(NotificationLog(booking_id=msg.booking_id, channel="email", recipient=msg.to,
                                   template=msg.template, status=status, error=error))
            db.commit()
    except Exception:
        pass


# ───────── Mise en forme ─────────
e = _html.escape


def portal_link(reference: str) -> str:
    return f"{cfg.public_url.rstrip('/')}/booking/{reference}#t={make_access_token(reference)}"


def _layout(business: str, heading: str, paras: list[str], rows: list[tuple[str, str]] | None = None,
            button: tuple[str, str] | None = None, footer: str = "",
            links: list[tuple[str, str]] | None = None) -> tuple[str, str]:
    """Retourne (html, texte). Tout contenu dynamique est échappé."""
    rows_html = "".join(
        f'<tr><td style="padding:8px 0;color:{MUTED};font-size:14px;border-bottom:1px solid {LINE}">{e(k)}</td>'
        f'<td style="padding:8px 0;text-align:right;font-size:14px;border-bottom:1px solid {LINE}">{e(v)}</td></tr>'
        for k, v in (rows or []))
    btn = (f'<p style="margin:28px 0"><a href="{e(button[1])}" style="background:{ESPRESSO};color:{IVORY};padding:14px 26px;'
           f'text-decoration:none;font-size:13px;letter-spacing:.12em;text-transform:uppercase;display:inline-block">{e(button[0])}</a></p>'
           ) if button else ""
    links_html = "".join(f'<p style="margin:0 0 10px;font-size:15px"><a href="{e(u)}" style="color:{OLIVE}">{e(r)}</a></p>' for r, u in (links or []))
    body = "".join(f'<p style="margin:0 0 16px;line-height:1.6;font-size:15px">{e(p)}</p>' for p in paras)
    html = (
        f'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:{IVORY};color:{ESPRESSO};font-family:Helvetica,Arial,sans-serif">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">'
        f'<table role="presentation" width="560" style="max-width:560px;width:100%"><tr><td>'
        f'<p style="font-family:Georgia,serif;font-style:italic;font-size:26px;margin:0 0 28px">{e(business)}</p>'
        f'<h1 style="font-family:Georgia,serif;font-weight:400;font-size:30px;line-height:1.15;margin:0 0 20px">{e(heading)}</h1>'
        f'{body}'
        f'{"<table role=presentation width=100% cellpadding=0 cellspacing=0 style=margin:8px 0 8px>" + rows_html + "</table>" if rows_html else ""}'
        f'{links_html}{btn}'
        f'<p style="margin:32px 0 0;color:{MUTED};font-size:12px;line-height:1.5">{e(footer)}</p>'
        f'</td></tr></table></td></tr></table></body></html>')
    text = "\n\n".join([heading, *paras]
                       + (["\n".join(f"{k}: {v}" for k, v in rows)] if rows else [])
                       + (["\n".join(f"{r}: {u}" for r, u in links)] if links else [])
                       + ([f"{button[0]}: {button[1]}"] if button else []) + ([footer] if footer else []))
    return html, text


def _money(v) -> str:
    return f"${float(v):,.2f}"


def _when(dt, s: dict) -> str:
    return dt.astimezone(ZoneInfo(s["timezone"])).strftime("%a %b %d, %Y at %I:%M %p")


def _summary(b: Booking, s: dict) -> list[tuple[str, str]]:
    return [("Reference", b.reference),
            *[("Item", f"{i.quantity} × {i.product_name}") for i in b.items],
            ("Pick-up", _when(b.start_at, s)), ("Return", _when(b.end_at, s)),
            ("Total", _money(b.total)), ("Balance due", _money(b.total - sum(
                (p.amount for p in b.payments if p.status.value == "verified"), 0)))]


def _msg(to: str, subject: str, template: str, b: Booking | None, s: dict, heading: str, paras: list[str],
         rows=None, button=None, footer="", links=None) -> Message:
    html, text = _layout(s["business_name"], heading, paras, rows, button, footer, links)
    return Message(to=to, subject=subject, text=text, html=html, template=template, booking_id=b.id if b else None)


FOOT = "You're receiving this because of a booking request made on our website."


# ───────── Messages clients ─────────
def booking_received(b: Booking, s: dict) -> Message:
    return _msg(b.customer.email, f"We received your request {b.reference}", "booking_received", b, s,
                f"Thank you, {b.customer.full_name.split()[0]}.",
                ["We've received your booking request. We review every request personally and will confirm by email. "
                 "No payment has been taken.", "Keep the link below: it's how you follow your booking and send payment details."],
                _summary(b, s), ("Open my booking", portal_link(b.reference)), FOOT)


def booking_confirmed(b: Booking, s: dict) -> Message:
    return _msg(b.customer.email, f"Your booking {b.reference} is confirmed", "booking_confirmed", b, s,
                "Your booking is confirmed.",
                ["Good news: we've confirmed your rental. Open your booking page for payment instructions and to send us your payment details."],
                _summary(b, s), ("View payment instructions", portal_link(b.reference)), FOOT)


def booking_rejected(b: Booking, s: dict) -> Message:
    return _msg(b.customer.email, f"About your request {b.reference}", "booking_rejected", b, s,
                "We couldn't accept this request.",
                ["Unfortunately we aren't able to fulfil this request as submitted. Nothing has been charged. "
                 "Reply to this email or message us — we'll gladly look at other dates or pieces."],
                [("Reference", b.reference)], None, FOOT)


def booking_cancelled(b: Booking, s: dict) -> Message:
    return _msg(b.customer.email, f"Booking {b.reference} cancelled", "booking_cancelled", b, s,
                "Your booking was cancelled.",
                ["This booking has been cancelled and the items released. If you didn't expect this, please contact us."],
                [("Reference", b.reference)], None, FOOT)


def payment_ack(b: Booking, p: PaymentRecord, s: dict) -> Message:
    return _msg(b.customer.email, f"Payment details received for {b.reference}", "payment_ack", b, s,
                "We received your payment details.",
                [f"You told us you paid {_money(p.amount)} by {p.method}. We verify every payment by hand against our account, "
                 "so your booking isn't marked paid until we do. We'll email you as soon as it's checked."],
                [("Reference", b.reference), ("Amount", _money(p.amount))], ("View my booking", portal_link(b.reference)), FOOT)


def payment_verified(b: Booking, p: PaymentRecord, s: dict) -> Message:
    bal = float(b.total) - float(sum((x.amount for x in b.payments if x.status.value == "verified"), 0))
    return _msg(b.customer.email, f"Payment verified for {b.reference}", "payment_verified", b, s,
                "Your payment is verified.",
                [f"We've verified your payment of {_money(p.amount)}. " + ("Your booking is paid in full — thank you."
                 if bal <= 0.005 else f"The remaining balance is {_money(bal)}.")],
                [("Reference", b.reference), ("Verified", _money(p.amount)), ("Balance due", _money(max(bal, 0)))],
                ("View my booking", portal_link(b.reference)), FOOT)


def payment_rejected(b: Booking, p: PaymentRecord, s: dict) -> Message:
    return _msg(b.customer.email, f"We couldn't verify your payment for {b.reference}", "payment_rejected", b, s,
                "We couldn't verify this payment.",
                [f"We weren't able to match your {_money(p.amount)} payment on our side. Your booking is unchanged. "
                 "Please check the details and send them again, or contact us and we'll sort it out together."],
                [("Reference", b.reference), ("Amount", _money(p.amount))], ("Open my booking", portal_link(b.reference)), FOOT)


def link_reminder(email: str, items: list[tuple[str, str]], s: dict) -> Message:
    return _msg(email, "Your booking links", "link_reminder", None, s, "Here are your booking links.",
                ["You asked us to resend the links to your bookings. Anyone with a link can see that booking, so keep them private."],
                footer="If you didn't ask for this, you can ignore this email.", links=items)


# ───────── Alertes propriétaire ─────────
def _admin(path: str) -> str:
    return f"{cfg.public_url.rstrip('/')}{path}"


def _owners(s: dict) -> list[str]:
    """Destinataires des alertes : la liste privée si elle existe, sinon l'email de contact public."""
    listed = [e.strip() for e in (s.get("notification_emails") or []) if "@" in str(e)]
    if listed:
        return list(dict.fromkeys(listed))[:5]
    one = (s.get("contact_email") or "").strip()
    return [one] if "@" in one else []


def owner_new_request(b: Booking, s: dict) -> list[Message]:
    return [_msg(to, f"New booking request {b.reference}", "owner_new_request", b, s, "New booking request",
                [f"{b.customer.full_name} ({b.customer.email}, {b.customer.phone}) sent a request that needs your review."],
                _summary(b, s), ("Review request", _admin(f"/admin/bookings/{b.reference}"))) for to in _owners(s)]


def owner_payment_submitted(b: Booking, p: PaymentRecord, s: dict) -> list[Message]:
    return [_msg(to, f"Payment to verify — {b.reference}", "owner_payment_submitted", b, s, "A payment needs verifying",
                [f"{b.customer.full_name} says they paid {_money(p.amount)} by {p.method}"
                 + (f" (ref {p.transaction_reference})" if p.transaction_reference else "") + ". Check your account, then verify or reject it."],
                [("Reference", b.reference), ("Amount", _money(p.amount)), ("Method", p.method)],
                ("Review payment", _admin("/admin/payments"))) for to in _owners(s)]


def queue(background, messages: list) -> None:
    """Planifie l'envoi après la réponse HTTP (ne bloque jamais la requête). Accepte des listes imbriquées."""
    for m in messages:
        if isinstance(m, list):
            queue(background, m)
        elif m:
            background.add_task(deliver, m)
