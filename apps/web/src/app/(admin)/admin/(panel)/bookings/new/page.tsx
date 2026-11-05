"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader, inputCls, selectCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { post, useAction, useAdmin, useAdminFetch } from "@/lib/admin";
import { formatMoney, type Product } from "@/lib/api";
import { TIME_SLOTS, zonedToUtcISO } from "@/lib/time";

export default function NewBooking() {
  const router = useRouter();
  const { settings } = useAdmin();
  const { data: products } = useAdminFetch<Product[]>("/api/admin/products");
  const [qty, setQty] = useState<Record<number, number>>({});
  const [v, setV] = useState({ sd: "", st: "09:00", ed: "", et: "18:00", name: "", email: "", phone: "", event: "", notes: "",
    method: "pickup", address: "", status: "confirmed" });
  const { busy, error, run } = useAction();
  const items = Object.entries(qty).filter(([, n]) => n > 0).map(([id, n]) => ({ product_id: Number(id), quantity: n }));
  const ready = items.length > 0 && v.sd && v.ed && v.name && v.email && v.phone && (v.method === "pickup" || v.address);

  const save = () => run(async () => {
    const r = await post<{ reference: string }>("/api/admin/bookings", {
      items, start_at: zonedToUtcISO(v.sd, v.st, settings.timezone), end_at: zonedToUtcISO(v.ed, v.et, settings.timezone),
      customer: { full_name: v.name, email: v.email, phone: v.phone }, fulfillment: v.method,
      delivery_address: v.method === "delivery" ? v.address : null, event_type: v.event || null, instructions: v.notes, status: v.status,
    });
    router.push(`/admin/bookings/${r.reference}`);
  });
  const f = (k: keyof typeof v) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value }) });

  return (
    <div>
      <p className="mb-4 text-sm"><Link href="/admin/bookings" className="link-draw">← Bookings</Link></p>
      <PageHeader eyebrow="Manual entry" title="New booking" />
      <div className="mt-8 grid max-w-4xl gap-10">
        <fieldset>
          <legend className="eyebrow">Items</legend>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {(products ?? []).filter((p) => p.is_active && p.total_quantity > 0).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span>{p.name} <span className="text-ink-soft">· {formatMoney(p.unit_price)}/{p.pricing_unit} · {p.total_quantity} in stock</span></span>
                <input type="number" min={0} max={p.total_quantity} aria-label={`Quantity of ${p.name}`} value={qty[p.id] ?? 0}
                  onChange={(e) => setQty({ ...qty, [p.id]: Math.max(0, Math.min(p.total_quantity, Number(e.target.value) || 0)) })}
                  className="w-20 border border-taupe bg-transparent px-2 py-2.5 text-right text-base sm:py-1.5 sm:text-sm" />
              </li>))}
          </ul>
        </fieldset>
        <fieldset className="grid gap-5 sm:grid-cols-4">
          <legend className="eyebrow mb-3">Dates ({settings.timezone.replace("_", " ")})</legend>
          <div><label htmlFor="n-sd" className="eyebrow block">Pick-up</label><input id="n-sd" type="date" {...f("sd")} onBlur={() => !v.ed && setV({ ...v, ed: v.sd })} className={inputCls} /></div>
          <div><label htmlFor="n-st" className="eyebrow block">Time</label><select id="n-st" {...f("st")} className={selectCls}>{TIME_SLOTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          <div><label htmlFor="n-ed" className="eyebrow block">Return</label><input id="n-ed" type="date" min={v.sd} {...f("ed")} className={inputCls} /></div>
          <div><label htmlFor="n-et" className="eyebrow block">Time</label><select id="n-et" {...f("et")} className={selectCls}>{TIME_SLOTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
        </fieldset>
        <fieldset className="grid gap-5 sm:grid-cols-3">
          <legend className="eyebrow mb-3">Customer</legend>
          <div><label htmlFor="n-name" className="eyebrow block">Full name</label><input id="n-name" {...f("name")} className={inputCls} /></div>
          <div><label htmlFor="n-email" className="eyebrow block">Email</label><input id="n-email" type="email" {...f("email")} className={inputCls} /></div>
          <div><label htmlFor="n-phone" className="eyebrow block">Phone (with country code)</label><input id="n-phone" type="tel" {...f("phone")} className={inputCls} /></div>
          <div><label htmlFor="n-ev" className="eyebrow block">Event type</label><input id="n-ev" {...f("event")} className={inputCls} /></div>
          <div><label htmlFor="n-m" className="eyebrow block">Fulfilment</label><select id="n-m" {...f("method")} className={selectCls}><option value="pickup">Pick-up</option><option value="delivery">Delivery</option></select></div>
          <div><label htmlFor="n-s" className="eyebrow block">Start as</label><select id="n-s" {...f("status")} className={selectCls}><option value="confirmed">Confirmed</option><option value="pending_review">Pending review</option></select></div>
          {v.method === "delivery" && <div className="sm:col-span-3"><label htmlFor="n-a" className="eyebrow block">Delivery address</label><input id="n-a" {...f("address")} className={inputCls} /></div>}
          <div className="sm:col-span-3"><label htmlFor="n-n" className="eyebrow block">Notes</label><input id="n-n" {...f("notes")} className={inputCls} /></div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div><Button arrow disabled={!ready || busy} onClick={save}>{busy ? "Checking stock…" : "Create booking"}</Button>
          <p className="mt-3 text-xs text-ink-soft">Stock is checked and totals are calculated by the server. Payment is recorded afterwards on the booking.</p></div>
      </div>
    </div>
  );
}
