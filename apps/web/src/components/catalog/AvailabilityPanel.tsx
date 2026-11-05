"use client";

import { useEffect, useMemo, useState } from "react";
import { ButtonLink, Button } from "@/components/ui/Button";
import { api, formatMoney, type Product } from "@/lib/api";
import { DatePicker } from "@/components/ui/DatePicker";
import { billableUnits } from "@/lib/pricing";
import { useFullDays } from "@/lib/useFullDays";
import { TIME_SLOTS, todayIn, zonedToUtcISO } from "@/lib/time";

type Result = { key: string; ok: boolean; available: number } | { key: string; error: true };

const control =
  "w-full border-0 border-b border-taupe bg-transparent py-2.5 text-base focus:border-espresso focus:outline-none";

export function AvailabilityPanel({ product, timeZone, whatsappUrl }:
  { product: Product; timeZone: string; whatsappUrl: string | null }) {
  const max = Math.max(product.total_quantity, 1);
  const [qty, setQty] = useState(1);
  const [sd, setSd] = useState("");
  const [st, setSt] = useState("09:00");
  const [ed, setEd] = useState("");
  const [et, setEt] = useState("18:00");
  const [result, setResult] = useState<Result | null>(null);
  const today = useMemo(() => todayIn(timeZone), [timeZone]);
  const items = useMemo(() => [{ product_id: product.id, quantity: qty }], [product.id, qty]);
  const { full, request } = useFullDays(items);

  const period = useMemo(() => {
    if (!sd || !ed) return null;
    const start = zonedToUtcISO(sd, st, timeZone);
    const end = zonedToUtcISO(ed, et, timeZone);
    return new Date(end) > new Date(start) ? { start, end } : "order";
  }, [sd, st, ed, et, timeZone]);

  const valid = period !== null && period !== "order" && sd >= today;
  const key = valid ? `${product.id}|${qty}|${period.start}|${period.end}` : "";

  // Vérification serveur, après une courte pause de saisie. L'état « en cours » est dérivé
  // (clé de la saisie ≠ clé du dernier résultat) plutôt que stocké.
  useEffect(() => {
    if (!valid || !period) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await api<{ items: { available: number; ok: boolean }[] }>("/api/availability", {
          method: "POST", signal: ctrl.signal,
          json: { items: [{ product_id: product.id, quantity: qty }], start_at: period.start, end_at: period.end },
        });
        setResult({ key, ok: r.items[0].ok, available: r.items[0].available });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setResult({ key, error: true });
      }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [key, valid, period, product.id, qty]);

  const current = result && result.key === key ? result : null;
  const checking = valid && !current;
  const ok = current && "ok" in current && current.ok;

  const estimate = valid && period
    ? billableUnits(product.pricing_unit, period.start, period.end) * Number(product.unit_price) * qty
    : null;

  const href = valid && period
    ? `/book?${new URLSearchParams({ item: product.slug, qty: String(qty), start: period.start, end: period.end })}`
    : "#";

  return (
    <section aria-labelledby="avail-h" className="border-t border-espresso pt-8">
      <h2 id="avail-h" className="eyebrow">Check availability</h2>

      <div className="mt-6 grid grid-cols-[1fr_7.5rem] gap-x-5 gap-y-6">
        <DatePicker id="sd" label="Pick-up date" value={sd} min={today} full={full} onViewMonth={request}
          onChange={(d) => { setSd(d); if (!ed || ed < d) setEd(d); }} />
        <div>
          <label htmlFor="st" className="eyebrow block">Time</label>
          <select id="st" value={st} onChange={(e) => setSt(e.target.value)} className={control}>
            {TIME_SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <DatePicker id="ed" label="Return date" value={ed} min={sd || today} full={full} onViewMonth={request} onChange={setEd} />
        <div>
          <label htmlFor="et" className="eyebrow block">Time</label>
          <select id="et" value={et} onChange={(e) => setEt(e.target.value)} className={control}>
            {TIME_SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-soft">Times are in {timeZone.replace("_", " ")} time.</p>

      <div className="mt-6 flex items-center justify-between">
        <span id="qty-l" className="eyebrow">Quantity</span>
        <div role="group" aria-labelledby="qty-l" className="flex items-center border border-taupe">
          <button type="button" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty(qty - 1)}
            className="h-11 w-11 text-xl disabled:opacity-30">−</button>
          <output aria-live="polite" className="w-10 text-center tabular-nums">{qty}</output>
          <button type="button" aria-label="Increase quantity" disabled={qty >= max} onClick={() => setQty(qty + 1)}
            className="h-11 w-11 text-xl disabled:opacity-30">+</button>
        </div>
      </div>

      {/* Zone d'état : annoncée aux lecteurs d'écran, jamais de message rassurant sans vérification */}
      <div role="status" aria-live="polite" className="mt-6 min-h-[4.5rem] border-l-2 border-line pl-4 text-sm">
        {period === "order" && <p className="text-danger">The return must be after the pick-up.</p>}
        {sd && sd < today && <p className="text-danger">Pick-up can&rsquo;t be in the past.</p>}
        {!period && <p className="text-ink-soft">Choose your dates to see live availability.</p>}
        {checking && <p className="text-ink-soft">Checking availability…</p>}
        {current && "error" in current && (
          <p className="text-danger">We couldn&rsquo;t check availability just now. Please try again, or ask us on WhatsApp.</p>
        )}
        {current && "ok" in current && current.ok && (
          <p className="text-success"><strong>Available.</strong> {qty} × {product.name} is free for these dates
            ({current.available} unit{current.available === 1 ? "" : "s"} open in that window).</p>
        )}
        {current && "ok" in current && !current.ok && current.available > 0 && (
          <p className="text-danger"><strong>Only {current.available} available</strong> for these dates.{" "}
            <button type="button" onClick={() => setQty(current.available)} className="underline underline-offset-2">
              Set quantity to {current.available}
            </button>
          </p>
        )}
        {current && "ok" in current && !current.ok && current.available === 0 && (
          <p className="text-danger"><strong>Not available</strong> for these dates. Try different dates or ask us about alternatives.</p>
        )}
      </div>

      {estimate !== null && ok && (
        <dl className="mt-5 space-y-1 border-t border-line pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-ink-soft">Estimated rental</dt><dd>{formatMoney(estimate)}</dd></div>
          {Number(product.security_deposit) > 0 && (
            <div className="flex justify-between"><dt className="text-ink-soft">Security deposit</dt>
              <dd>{formatMoney(Number(product.security_deposit) * qty)}</dd></div>
          )}
          <p className="pt-2 text-xs text-ink-soft">Estimate only — your final total is calculated when you submit the request.</p>
        </dl>
      )}

      <div className="mt-6 grid gap-3">
        {ok ? (
          <ButtonLink href={href} arrow className="w-full">Continue to booking</ButtonLink>
        ) : (
          <Button disabled className="w-full">Continue to booking</Button>
        )}
        {whatsappUrl && (
          <ButtonLink href={whatsappUrl} variant="outline" className="w-full" target="_blank" rel="noopener noreferrer">
            Ask about this item
          </ButtonLink>
        )}
      </div>
      <p className="mt-4 text-xs text-ink-soft">
        Nothing is reserved until you submit a request, and every request is reviewed before it is confirmed.
      </p>
    </section>
  );
}
