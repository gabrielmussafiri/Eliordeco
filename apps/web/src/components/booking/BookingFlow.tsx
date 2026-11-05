"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, TextArea } from "@/components/ui/Field";
import { Photo } from "@/components/ui/Photo";
import { ApiError, api, formatDateTime, formatMoney, unitLabel, type Product, type PublicSettings } from "@/lib/api";
import { errorMessage, saveAccess, type BookingView, type Quote } from "@/lib/booking";
import { DatePicker } from "@/components/ui/DatePicker";
import { useFullDays } from "@/lib/useFullDays";
import { TIME_SLOTS, isoToZoned, todayIn, zonedToUtcISO } from "@/lib/time";

type Shortage = { product_id: number; requested: number; available: number };
const STEPS = ["Pieces", "Dates", "Your details", "Review"] as const;
import { BRAND_NAME, EVENT_TYPES, INCLUDED } from "@/lib/content";
const EVENTS = [...EVENT_TYPES, "Other"];
const select = "w-full border-0 border-b border-taupe bg-transparent py-3 focus:border-espresso focus:outline-none";

interface Props {
  products: Product[];
  settings: PublicSettings;
  initial: { itemId?: number; qty: number; start?: string; end?: string };
}

export function BookingFlow({ products, settings, initial }: Props) {
  const router = useRouter();
  const tz = settings.timezone;
  const today = useMemo(() => todayIn(tz), [tz]);
  const pre = useMemo(() => ({
    s: initial.start ? isoToZoned(initial.start, tz) : null,
    e: initial.end ? isoToZoned(initial.end, tz) : null,
  }), [initial.start, initial.end, tz]);

  const [step, setStep] = useState(initial.itemId && pre.s && pre.e ? 2 : 1);
  const [qty, setQty] = useState<Record<number, number>>(initial.itemId ? { [initial.itemId]: initial.qty } : {});
  const [sd, setSd] = useState(pre.s?.date ?? "");
  const [st, setSt] = useState(pre.s?.time ?? "09:00");
  const [ed, setEd] = useState(pre.e?.date ?? "");
  const [et, setEt] = useState(pre.e?.time ?? "18:00");
  const [c, setC] = useState({ full_name: "", email: "", phone: "", event_type: "", instructions: "", address: "" });
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">(settings.delivery_enabled ? "delivery" : "pickup");
  const [agree, setAgree] = useState(false);

  const [hold, setHold] = useState<{ token: string; expires: number } | null>(null);
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const heading = useRef<HTMLHeadingElement>(null);

  const items = Object.entries(qty).filter(([, n]) => n > 0).map(([id, n]) => ({ product_id: Number(id), quantity: n }));
  const { full, request } = useFullDays(items);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const period = useMemo(() => {
    if (!sd || !ed) return null;
    const start_at = zonedToUtcISO(sd, st, tz), end_at = zonedToUtcISO(ed, et, tz);
    return new Date(end_at) > new Date(start_at) ? { start_at, end_at } : null;
  }, [sd, st, ed, et, tz]);

  // Le compte à rebours du blocage temporaire ne fait que s'afficher : le serveur reste l'autorité.
  useEffect(() => {
    if (!hold) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hold]);
  useEffect(() => { heading.current?.focus(); }, [step]);

  const secondsLeft = hold ? Math.max(0, Math.floor((hold.expires - now) / 1000)) : 0;
  const holdActive = !!hold && secondsLeft > 0;

  function go(n: number) { setError(""); setFieldErrors({}); setStep(n); window.scrollTo({ top: 0, behavior: "smooth" }); }

  // Étape 2 → 3 : validation serveur de la disponibilité + blocage temporaire du stock
  async function validateAndHold() {
    if (!period) return;
    setBusy(true); setError(""); setShortages([]);
    try {
      const r = await api<{ token: string; ttl_minutes: number }>("/api/holds", {
        method: "POST", json: { items, ...period, token: hold?.token },
      });
      setHold({ token: r.token, expires: Date.now() + r.ttl_minutes * 60_000 });
      setNow(Date.now());
      go(3);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const d = e.detail as { items?: Shortage[] };
        setShortages((d.items ?? []).filter((s) => s.requested > s.available));
      }
      setError(errorMessage(e));
    } finally { setBusy(false); }
  }

  function validateDetails() {
    const errs: Record<string, string> = {};
    if (c.full_name.trim().length < 2) errs.full_name = "Please enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(c.email)) errs.email = "Enter a valid email address.";
    if (c.phone.replace(/\D/g, "").length < 7) errs.phone = "Enter a phone number we can reach you on.";
    if (fulfillment === "delivery" && !c.address.trim()) errs.address = "Delivery needs an address.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function toReview() {
    if (!validateDetails() || !period) return;
    setBusy(true); setError("");
    try {
      setQuote(await api<Quote>("/api/quote", { method: "POST", json: { items, ...period, fulfillment } }));
      go(4);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  async function submit() {
    if (!period) return;
    setBusy(true); setError("");
    try {
      const r = await api<{ access_token: string; booking: BookingView }>("/api/bookings", {
        method: "POST",
        json: {
          items, ...period, fulfillment, hold_token: hold?.token,
          customer: { full_name: c.full_name.trim(), email: c.email.trim(), phone: c.phone.trim() },
          delivery_address: fulfillment === "delivery" ? c.address.trim() : null,
          event_type: c.event_type || null, instructions: c.instructions.trim(),
        },
      });
      saveAccess(r.booking.reference, r.access_token);
      router.push(`/booking/${r.booking.reference}#t=${r.access_token}&new=1`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setHold(null); go(2); }
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="mt-14 grid gap-14 lg:grid-cols-12 lg:gap-20">
      <div className="lg:col-span-7">
        <ol aria-label="Progress" className="flex flex-wrap gap-x-5 gap-y-2 border-b border-line pb-5 sm:gap-x-8">
          {STEPS.map((label, i) => {
            const n = i + 1;
            return (
              <li key={label} aria-current={n === step ? "step" : undefined}
                className={`text-[0.72rem] font-semibold uppercase tracking-[0.08em] sm:text-[0.75rem] sm:tracking-[0.16em] ${n === step ? "text-espresso" : n < step ? "text-olive-deep" : "text-taupe"}`}>
                {n < step ? (
                  <button type="button" onClick={() => go(n)} className="link-draw uppercase tracking-[0.16em]">{n}. {label}</button>
                ) : <span>{n}. {label}</span>}
              </li>
            );
          })}
        </ol>

        <h2 ref={heading} tabIndex={-1} className="display h-md mt-10 focus:outline-none focus-visible:outline-none">
          {["What would you like to rent?", "When do you need it?", "How can we reach you?", "Review your request"][step - 1]}
        </h2>

        <div role="alert" className="mt-6 empty:hidden">
          {error && <p className="border-l-2 border-danger pl-4 text-sm text-danger">{error}</p>}
          {shortages.length > 0 && (
            <ul className="mt-3 space-y-1 border-l-2 border-line pl-4 text-sm">
              {shortages.map((s) => (
                <li key={s.product_id}>{byId.get(s.product_id)?.name}: you asked for {s.requested},{" "}
                  {s.available > 0 ? `only ${s.available} available` : "none available"} on these dates.</li>
              ))}
              <li><button type="button" onClick={() => go(1)} className="underline underline-offset-4">Adjust quantities</button>
                {" "}or <button type="button" onClick={() => setShortages([])} className="underline underline-offset-4">change the dates</button>.</li>
            </ul>
          )}
        </div>

        {/* ───── 1. Pièces ───── */}
        {step === 1 && (
          <div>
            <ul className="mt-8 divide-y divide-line border-y border-line">
              {products.map((p) => {
                const n = qty[p.id] ?? 0;
                return (
                  <li key={p.id} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-4 py-4 sm:grid-cols-[6rem_1fr_auto]">
                    <div className="frame relative aspect-square">
                      {p.images[0] && <Photo src={p.images[0].url} alt="" sizes="96px" />}
                    </div>
                    <div>
                      <p className="display h-sm">{p.name}</p>
                      <p className="text-sm text-ink-soft">{formatMoney(p.unit_price)} / {unitLabel[p.pricing_unit]}
                        {Number(p.security_deposit) > 0 && ` · ${formatMoney(p.security_deposit)} deposit`}</p>
                    </div>
                    <div role="group" aria-label={`Quantity of ${p.name}`} className="flex items-center border border-taupe">
                      <button type="button" aria-label={`Remove one ${p.name}`} disabled={n <= 0}
                        onClick={() => setQty({ ...qty, [p.id]: n - 1 })} className="h-11 w-10 text-xl disabled:opacity-30">−</button>
                      <output className="w-8 text-center tabular-nums">{n}</output>
                      <button type="button" aria-label={`Add one ${p.name}`} disabled={n >= p.total_quantity}
                        onClick={() => setQty({ ...qty, [p.id]: n + 1 })} className="h-11 w-10 text-xl disabled:opacity-30">+</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Button arrow disabled={items.length === 0} onClick={() => go(2)} className="mt-10">Continue to dates</Button>
            {items.length === 0 && <p className="mt-3 text-sm text-ink-soft">Choose at least one piece to continue.</p>}
          </div>
        )}

        {/* ───── 2. Dates + validation ───── */}
        {step === 2 && (
          <div>
            <div className="mt-8 grid max-w-xl grid-cols-[1fr_8rem] gap-x-6 gap-y-7">
              <DatePicker id="b-sd" label="Pick-up date" value={sd} min={today} full={full} onViewMonth={request}
                onChange={(d) => { setSd(d); if (!ed || ed < d) setEd(d); }} />
              <div>
                <label htmlFor="b-st" className="eyebrow block">Time</label>
                <select id="b-st" value={st} onChange={(e) => setSt(e.target.value)} className={select}>
                  {TIME_SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <DatePicker id="b-ed" label="Return date" value={ed} min={sd || today} full={full} onViewMonth={request} onChange={setEd} />
              <div>
                <label htmlFor="b-et" className="eyebrow block">Time</label>
                <select id="b-et" value={et} onChange={(e) => setEt(e.target.value)} className={select}>
                  {TIME_SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <p className="mt-4 text-sm text-ink-soft">Times are in {tz.replace("_", " ")} time.</p>
            {sd && sd < today && <p role="alert" className="mt-3 text-sm text-danger">Pick-up can&rsquo;t be in the past.</p>}
            {sd && ed && !period && <p role="alert" className="mt-3 text-sm text-danger">The return must be after the pick-up.</p>}
            <div className="mt-10 flex flex-wrap items-center gap-6">
              <Button variant="outline" onClick={() => go(1)}>Back</Button>
              <Button arrow disabled={!period || sd < today || busy} onClick={validateAndHold}>
                {busy ? "Checking availability…" : "Check availability"}
              </Button>
            </div>
            <p className="mt-4 max-w-md text-sm text-ink-soft">
              We check live stock and hold your pieces for {30} minutes while you finish. Nothing is final until we confirm your request.
            </p>
          </div>
        )}

        {/* ───── 3. Coordonnées ───── */}
        {step === 3 && (
          <form noValidate onSubmit={(e) => { e.preventDefault(); void toReview(); }} className="mt-8 max-w-xl space-y-8">
            <div className="grid gap-8 sm:grid-cols-2">
              <Field id="c-name" label="Full name" autoComplete="name" value={c.full_name} error={fieldErrors.full_name}
                onChange={(e) => setC({ ...c, full_name: e.target.value })} className="sm:col-span-2" />
              <Field id="c-email" label="Email" type="email" autoComplete="email" value={c.email} error={fieldErrors.email}
                onChange={(e) => setC({ ...c, email: e.target.value })} />
              <Field id="c-phone" label="Phone" type="tel" autoComplete="tel" value={c.phone} error={fieldErrors.phone}
                hint="Include country code, e.g. 1 555 123 4567" onChange={(e) => setC({ ...c, phone: e.target.value })} />
            </div>
            <div>
              <label htmlFor="c-event" className="eyebrow block">Event type <span className="normal-case tracking-normal text-ink-soft">(optional)</span></label>
              <select id="c-event" value={c.event_type} onChange={(e) => setC({ ...c, event_type: e.target.value })} className={select}>
                <option value="">Select…</option>
                {EVENTS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <fieldset>
              <legend className="eyebrow">Pick-up or delivery</legend>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {([["pickup", "I'll collect it", "Pick up and return it yourself"],
                  ...(settings.delivery_enabled ? [["delivery", "Delivery & setup", Number(settings.delivery_fee) > 0 ? `Delivery fee ${formatMoney(settings.delivery_fee)} · we set up and collect` : INCLUDED]] : [])] as const)
                  .map(([v, t, d]) => (
                  <label key={v} className={`cursor-pointer border p-4 transition-colors has-[:checked]:border-espresso has-[:checked]:bg-cream ${fulfillment === v ? "border-espresso" : "border-line"}`}>
                    <input type="radio" name="fulfillment" value={v} checked={fulfillment === v} className="sr-only"
                      onChange={() => setFulfillment(v as "pickup" | "delivery")} />
                    <span className="block font-semibold">{t}</span>
                    <span className="block text-sm text-ink-soft">{d}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {fulfillment === "delivery" && (
              <TextArea id="c-addr" label="Delivery address" value={c.address} error={fieldErrors.address}
                onChange={(e) => setC({ ...c, address: e.target.value })} autoComplete="street-address" />
            )}
            <TextArea id="c-notes" label="Additional instructions (optional)" value={c.instructions} maxLength={2000}
              onChange={(e) => setC({ ...c, instructions: e.target.value })} />
            <div className="flex flex-wrap items-center gap-6">
              <Button type="button" variant="outline" onClick={() => go(2)}>Back</Button>
              <Button type="submit" arrow disabled={busy}>{busy ? "Preparing summary…" : "Review request"}</Button>
            </div>
          </form>
        )}

        {/* ───── 4. Récapitulatif + envoi ───── */}
        {step === 4 && quote && period && (
          <div className="mt-8 max-w-xl">
            <table className="w-full text-sm">
              <caption className="sr-only">Rental summary</caption>
              <thead className="text-left text-ink-soft">
                <tr><th className="pb-2 font-normal">Piece</th><th className="pb-2 text-right font-normal">Rate × duration</th><th className="pb-2 text-right font-normal">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-line border-y border-line">
                {quote.lines.map((l) => (
                  <tr key={l.product_id}>
                    <td className="py-3">{l.quantity} × {l.product_name}</td>
                    <td className="py-3 text-right text-ink-soft">{formatMoney(l.unit_price)} × {l.billable_units} {unitLabel[l.pricing_unit]}{l.billable_units > 1 ? "s" : ""}</td>
                    <td className="py-3 text-right">{formatMoney(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-5 space-y-2 text-sm">
              <Row k="Rental" v={formatMoney(quote.subtotal)} />
              {fulfillment === "delivery" && <Row k="Delivery" v={formatMoney(quote.delivery_fee)} />}
              {quote.deposit_amount > 0 && <Row k="Refundable security deposit" v={formatMoney(quote.deposit_amount)} />}
              <div className="flex justify-between border-t border-espresso pt-3 text-base font-semibold">
                <dt>Total</dt><dd>{formatMoney(quote.total)}</dd>
              </div>
            </dl>
            <p className="mt-6 border-l-2 border-olive pl-4 text-sm text-ink-soft">
              <strong className="text-espresso">No payment is taken now.</strong> After you submit, we review your request and
              you&rsquo;ll find payment instructions on your booking page. A request not reviewed within {settings.pending_expiry_hours ?? 48} hours expires automatically.
            </p>
            {(settings.rental_policies || settings.cancellation_policy) && (
              <div className="mt-6 space-y-3 text-sm text-ink-soft">
                {settings.rental_policies && <p><strong className="text-espresso">Rental policy.</strong> {settings.rental_policies}</p>}
                {settings.cancellation_policy && <p><strong className="text-espresso">Cancellation.</strong> {settings.cancellation_policy}</p>}
              </div>
            )}
            <label className="mt-6 flex items-start gap-3 text-sm">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-4 w-4 accent-olive-deep" />
              <span>I&rsquo;ve read the rental conditions and understand this is a request that {BRAND_NAME} must confirm.</span>
            </label>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <Button variant="outline" onClick={() => go(3)} disabled={busy}>Back</Button>
              <Button arrow onClick={submit} disabled={!agree || busy}>{busy ? "Sending…" : "Submit request"}</Button>
            </div>
          </div>
        )}
      </div>

      {/* ───── Récapitulatif latéral ───── */}
      <aside aria-label="Your selection" className="lg:col-span-5">
        <div className="bg-cream p-7 lg:sticky lg:top-28">
          <h2 className="eyebrow">Your selection</h2>
          {items.length === 0 ? <p className="mt-4 text-sm text-ink-soft">Nothing selected yet.</p> : (
            <ul className="mt-4 space-y-2">
              {items.map((i) => <li key={i.product_id} className="flex justify-between gap-4"><span>{byId.get(i.product_id)?.name}</span><span className="tabular-nums">× {i.quantity}</span></li>)}
            </ul>
          )}
          {period && (
            <dl className="mt-6 space-y-2 border-t border-taupe/50 pt-5 text-sm">
              <Row k="Pick-up" v={formatDateTime(period.start_at, tz)} />
              <Row k="Return" v={formatDateTime(period.end_at, tz)} />
            </dl>
          )}
          {step >= 3 && hold && (
            <p role="status" className={`mt-6 border-t border-taupe/50 pt-5 text-sm ${holdActive ? "text-success" : "text-danger"}`}>
              {holdActive
                ? <>Pieces held for you: <strong className="tabular-nums">{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</strong></>
                : "Your hold has expired. We’ll re-check availability when you submit."}
            </p>
          )}
          {step === 4 && quote && (
            <p className="mt-6 flex justify-between border-t border-taupe/50 pt-5 text-lg"><span>Total</span><strong>{formatMoney(quote.total)}</strong></p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-6"><dt className="text-ink-soft">{k}</dt><dd className="text-right">{v}</dd></div>;
}
