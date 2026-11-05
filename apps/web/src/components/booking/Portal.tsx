"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api, formatDateTime, formatMoney, unitLabel, type PublicSettings } from "@/lib/api";
import {
  SAVED_KEY, bookingStatusLabel, errorMessage, paymentStatusLabel, readSaved, saveAccess, subscribeSaved,
  type BookingView, type PaymentOut,
} from "@/lib/booking";
import { prepareUpload } from "@/lib/image";
import { todayIn, zonedToUtcISO } from "@/lib/time";

type Loaded = { key: string; booking?: BookingView; settings?: PublicSettings; status?: "notfound" | "error" };

const hashParams = () => new URLSearchParams(window.location.hash.slice(1));

export function Portal({ reference }: { reference: string }) {
  // Jeton : fragment d'URL (#t=…) en priorité, sinon copie locale. Jamais envoyé dans l'URL au serveur.
  const token = useSyncExternalStore(
    subscribeSaved,
    () => hashParams().get("t") ?? readSaved(localStorage.getItem(SAVED_KEY))[reference] ?? "",
    () => "",
  );
  const isNew = useSyncExternalStore(subscribeSaved, () => hashParams().get("new") === "1", () => false);
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${reference}|${token}|${version}`;

  useEffect(() => {
    if (!token) return;
    saveAccess(reference, token);
    let cancelled = false;
    Promise.all([
      api<BookingView>(`/api/portal/${encodeURIComponent(reference)}`, { headers: { "X-Access-Token": token } }),
      api<PublicSettings>("/api/settings/public"),
    ]).then(([booking, settings]) => !cancelled && setLoaded({ key, booking, settings }))
      .catch((e) => !cancelled && setLoaded({ key, status: (e as { status?: number }).status === 404 ? "notfound" : "error" }));
    return () => { cancelled = true; };
  }, [key, reference, token]);

  if (!token || loaded?.status === "notfound") {
    return (
      <div className="max-w-xl">
        <h1 className="display h-lg">We couldn&rsquo;t open that booking</h1>
        <p className="mt-5 text-ink-soft">
          {token ? "The reference and access code don't match." : "This device doesn't have the access code for this booking."}{" "}
          Use the full link from your confirmation, or enter your access code.
        </p>
        <ButtonLink href="/booking" arrow className="mt-8">Find my booking</ButtonLink>
      </div>
    );
  }
  if (!loaded || loaded.key !== key) return <div className="h-96 animate-pulse bg-cream" aria-label="Loading your booking" role="status" />;
  if (loaded.status === "error" || !loaded.booking || !loaded.settings) {
    return (
      <div role="alert" className="max-w-xl">
        <h1 className="display h-lg">Something went wrong</h1>
        <p className="mt-5 text-ink-soft">We couldn&rsquo;t load your booking just now.</p>
        <Button className="mt-8" onClick={() => setVersion((v) => v + 1)}>Try again</Button>
      </div>
    );
  }
  return <View b={loaded.booking} s={loaded.settings} token={token} isNew={isNew} onChanged={() => setVersion((v) => v + 1)} />;
}

function View({ b, s, token, isNew, onChanged }:
  { b: BookingView; s: PublicSettings; token: string; isNew: boolean; onChanged: () => void }) {
  const tz = s.timezone;
  const closed = ["rejected", "cancelled", "expired"].includes(b.status);
  const next = {
    pending_review: `We review every request personally. Once it's confirmed you can send your payment details below. Requests that aren't reviewed within ${s.pending_expiry_hours ?? 48} hours expire automatically and release the items.`,
    confirmed: "Your booking is confirmed. Send your payment details below if you haven't yet.",
    active: "Your rental is under way.", completed: "Thank you for renting with us.",
    rejected: "We couldn't accept this request. Message us and we'll help find an alternative.",
    cancelled: "This booking was cancelled.", expired: "This request wasn't reviewed in time and expired, so the items were released. You can send a new request any time.",
  }[b.status] ?? "";

  return (
    <div className="grid gap-14 lg:grid-cols-12 lg:gap-20">
      <div className="lg:col-span-7">
        {isNew && (
          <div role="status" className="mb-10 border-l-2 border-olive pl-5">
            <p className="eyebrow">Request received</p>
            <p className="display h-md mt-2">Thank you, {b.customer.full_name.split(" ")[0]}.</p>
            <p className="mt-3 text-ink-soft">We&rsquo;ve emailed you a confirmation with the link to this page — it&rsquo;s how you&rsquo;ll follow your booking and send payment details. Check your spam folder if you don&rsquo;t see it.</p>
          </div>
        )}
        <p className="eyebrow">Booking reference</p>
        <h1 className="display h-xl mt-2 !text-[clamp(2.5rem,6vw,4.5rem)]">{b.reference}</h1>
        <div className="mt-6 flex flex-wrap gap-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em]">
          <span className="bg-espresso px-3 py-1.5 text-ivory">{bookingStatusLabel[b.status] ?? b.status}</span>
          <span className="border border-taupe px-3 py-1.5">{paymentStatusLabel[b.payment_status] ?? b.payment_status}</span>
        </div>
        <p className="mt-6 max-w-lg text-ink-soft">{next}</p>
        {b.whatsapp_url && (
          <ButtonLink href={b.whatsapp_url} variant="outline" className="mt-8" target="_blank" rel="noopener noreferrer">
            Message us on WhatsApp
          </ButtonLink>
        )}

        <section aria-labelledby="det" className="mt-16">
          <h2 id="det" className="eyebrow">Details</h2>
          <dl className="mt-5 divide-y divide-line border-y border-line text-sm">
            <Info k="Pick-up" v={formatDateTime(b.start_at, tz)} />
            <Info k="Return" v={formatDateTime(b.end_at, tz)} />
            <Info k={b.fulfillment_method === "delivery" ? "Delivery to" : "Collection"}
              v={b.fulfillment_method === "delivery" ? (b.delivery?.address ?? "—") : "You collect and return"} />
            {b.event_type && <Info k="Event" v={b.event_type} />}
            {b.instructions && <Info k="Notes" v={b.instructions} />}
          </dl>
        </section>

        <section aria-labelledby="pay" className="mt-16">
          <h2 id="pay" className="eyebrow">Payments</h2>
          {b.payments.length === 0 ? <p className="mt-5 text-sm text-ink-soft">No payments submitted yet.</p> : (
            <ul className="mt-5 divide-y divide-line border-y border-line">
              {b.payments.map((p) => <PaymentRow key={p.id} p={p} tz={tz} />)}
            </ul>
          )}
          {!closed && b.balance > 0 && b.payment_info && (
            <PaymentSection b={b} s={s} token={token} onDone={onChanged} />
          )}
          {b.balance === 0 && b.payment_status === "verified" && <p className="mt-6 text-success">Paid in full — thank you.</p>}
        </section>
      </div>

      <aside aria-label="Totals" className="lg:col-span-5">
        <div className="bg-cream p-7 lg:sticky lg:top-28">
          <h2 className="eyebrow">Your order</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {b.items.map((i) => (
              <li key={i.product_name} className="flex justify-between gap-4">
                <span>{i.quantity} × {i.product_name}<span className="block text-ink-soft">
                  {formatMoney(i.unit_price)} × {i.billable_units} {unitLabel[i.pricing_unit]}{i.billable_units > 1 ? "s" : ""}</span></span>
                <span>{formatMoney(i.line_total)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-5 space-y-2 border-t border-taupe/50 pt-5 text-sm">
            {b.delivery_fee > 0 && <Info plain k="Delivery" v={formatMoney(b.delivery_fee)} />}
            {b.deposit_amount > 0 && <Info plain k="Security deposit" v={formatMoney(b.deposit_amount)} />}
            <Info plain k="Total" v={formatMoney(b.total)} bold />
            <Info plain k="Verified payments" v={formatMoney(b.verified_total)} />
            <Info plain k="Balance due" v={formatMoney(b.balance)} bold />
          </dl>
        </div>
      </aside>
    </div>
  );
}

function Info({ k, v, plain, bold }: { k: string; v: string; plain?: boolean; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-6 ${plain ? "" : "py-3"} ${bold ? "font-semibold" : ""}`}>
      <dt className={bold ? "" : "text-ink-soft"}>{k}</dt><dd className="text-right">{v}</dd>
    </div>
  );
}

const payLabel: Record<PaymentOut["status"], string> = {
  submitted: "Awaiting verification", verified: "Verified", rejected: "Not accepted — please contact us", refunded: "Refunded",
};

function PaymentRow({ p, tz }: { p: PaymentOut; tz: string }) {
  return (
    <li className="flex items-start justify-between gap-6 py-4 text-sm">
      <div>
        <p className="font-semibold">{formatMoney(p.amount)} · {p.method}</p>
        <p className="text-ink-soft">{formatDateTime(p.paid_on, tz).split(",").slice(0, 2).join(",")}
          {p.transaction_reference && ` · Ref ${p.transaction_reference}`}{p.evidence.length > 0 && " · receipt attached"}</p>
      </div>
      <span className={`shrink-0 text-xs font-semibold uppercase tracking-[0.12em] ${p.status === "verified" ? "text-success" : p.status === "rejected" ? "text-danger" : "text-ink-soft"}`}>
        {payLabel[p.status]}
      </span>
    </li>
  );
}

function PaymentSection({ b, s, token, onDone }:
  { b: BookingView; s: PublicSettings; token: string; onDone: () => void }) {
  const info = b.payment_info!;
  const bank = Object.entries(info.bank_details ?? {}).filter(([, v]) => v);
  const suggested = useMemo(() => {
    const dep = Math.round(b.total * (info.deposit_percentage / 100) * 100) / 100;
    return (b.verified_total === 0 ? Math.min(dep || b.balance, b.balance) : b.balance).toFixed(2);
  }, [b, info.deposit_percentage]);

  const [amount, setAmount] = useState(suggested);
  const [method, setMethod] = useState(info.methods[0] ?? "");
  const [date, setDate] = useState(() => todayIn(s.timezone));
  const [ref, setRef] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const n = Number(amount);
    if (!(n > 0)) return setError("Enter the amount you paid.");
    const fd = new FormData();
    fd.set("amount", amount); fd.set("method", method);
    fd.set("paid_on", zonedToUtcISO(date, "12:00", s.timezone));
    if (ref.trim()) fd.set("transaction_reference", ref.trim());
    setBusy(true);
    try {
      if (file) fd.set("receipt", await prepareUpload(file));
      await api(`/api/portal/${encodeURIComponent(b.reference)}/payments`, {
        method: "POST", body: fd, headers: { "X-Access-Token": token },
      });
      setDone(true); onDone();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }

  return (
    <div className="mt-10 bg-cream p-7">
      <h3 className="display h-sm">How to pay</h3>
      {info.instructions && <p className="mt-3 whitespace-pre-line text-sm text-ink-soft">{info.instructions}</p>}
      {bank.length > 0 && (
        <dl className="mt-4 space-y-1 text-sm">
          {bank.map(([k, v]) => <div key={k} className="flex gap-4"><dt className="w-36 capitalize text-ink-soft">{k.replace("_", " ")}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
      <p className="mt-4 text-sm text-ink-soft">
        Pay outside this site, then tell us below. Your booking isn&rsquo;t marked paid until we verify the payment ourselves.
      </p>

      {done && <p role="status" className="mt-6 border-l-2 border-olive pl-4 text-sm">Thank you — your payment details were sent. We&rsquo;ll verify them and update this page.</p>}
      <form onSubmit={submit} className="mt-8 grid gap-7 sm:grid-cols-2">
        <Field id="p-amt" label="Amount paid (USD)" inputMode="decimal" value={amount} required
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          hint={`Balance due ${formatMoney(b.balance)}`} />
        <div>
          <label htmlFor="p-method" className="eyebrow block">Payment method</label>
          <select id="p-method" value={method} onChange={(e) => setMethod(e.target.value)}
            className="w-full border-0 border-b border-taupe bg-transparent py-3 focus:border-espresso focus:outline-none">
            {info.methods.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <Field id="p-date" label="Payment date" type="date" max={todayIn(s.timezone)} value={date} required onChange={(e) => setDate(e.target.value)} />
        <Field id="p-ref" label="Transaction reference (optional)" value={ref} maxLength={120} onChange={(e) => setRef(e.target.value)} />
        <div className="sm:col-span-2">
          <label htmlFor="p-file" className="eyebrow block">Receipt or screenshot (optional)</label>
          <input id="p-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-3 block w-full text-sm file:mr-4 file:border file:border-espresso file:bg-transparent file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wider" />
          <p className="mt-2 text-xs text-ink-soft">JPEG, PNG, WebP or PDF. Large photos are reduced automatically; PDFs must be under 4 MB.</p>
        </div>
        {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2"><Button type="submit" arrow disabled={busy}>{busy ? "Sending…" : "Send payment details"}</Button></div>
      </form>
    </div>
  );
}

export function RecentBookings() {
  const raw = useSyncExternalStore(subscribeSaved, () => localStorage.getItem(SAVED_KEY) ?? "", () => "");
  const refs = Object.keys(readSaved(raw || null));
  if (!refs.length) return null;
  return (
    <div className="mt-16 max-w-xl">
      <h2 className="eyebrow">On this device</h2>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {refs.map((r) => (
          <li key={r}><Link href={`/booking/${r}`} className="link-draw block py-4 display h-sm">{r}</Link></li>
        ))}
      </ul>
    </div>
  );
}
