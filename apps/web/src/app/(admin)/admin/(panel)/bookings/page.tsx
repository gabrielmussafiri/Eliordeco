"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Empty, ErrorNote, Loading, PageHeader, Status, inputCls, selectCls } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/Button";
import { useAdmin, useAdminFetch, type BookingRow } from "@/lib/admin";
import { formatDateTime, formatMoney } from "@/lib/api";
import { bookingStatusLabel } from "@/lib/booking";
import { zonedToUtcISO } from "@/lib/time";

const PAY = ["unpaid", "submitted", "partially_paid", "verified", "rejected", "refunded"];

export default function Bookings() {
  const { settings } = useAdmin();
  const sp = useSearchParams();
  const [f, setF] = useState({ q: "", status: sp.get("status") ?? "", payment_status: "", from: "", to: "" });
  const [applied, setApplied] = useState(f);

  const qs = new URLSearchParams();
  if (applied.q) qs.set("q", applied.q);
  if (applied.status) qs.set("status", applied.status);
  if (applied.payment_status) qs.set("payment_status", applied.payment_status);
  if (applied.from) qs.set("date_from", zonedToUtcISO(applied.from, "00:00", settings.timezone));
  if (applied.to) qs.set("date_to", zonedToUtcISO(applied.to, "23:59", settings.timezone));
  const { data, error, reload } = useAdminFetch<BookingRow[]>(`/api/admin/bookings?${qs}`);

  const set = (k: keyof typeof f, v: string, now = false) => {
    const n = { ...f, [k]: v };
    setF(n);
    if (now) setApplied(n);
  };

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Bookings" actions={<ButtonLink href="/admin/bookings/new" className="min-h-11">New booking</ButtonLink>} />
      <form role="search" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}
        className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] lg:items-end">
        <div><label htmlFor="q" className="eyebrow block">Search</label>
          <input id="q" value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Reference, name or email" className={inputCls} /></div>
        <div><label htmlFor="st" className="eyebrow block">Status</label>
          <select id="st" value={f.status} onChange={(e) => set("status", e.target.value, true)} className={selectCls}>
            <option value="">All</option>
            {Object.entries(bookingStatusLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div><label htmlFor="ps" className="eyebrow block">Payment</label>
          <select id="ps" value={f.payment_status} onChange={(e) => set("payment_status", e.target.value, true)} className={selectCls}>
            <option value="">All</option>{PAY.map((v) => <option key={v} value={v}>{v.replace("_", " ")}</option>)}
          </select></div>
        <div><label htmlFor="df" className="eyebrow block">From</label>
          <input id="df" type="date" value={f.from} onChange={(e) => set("from", e.target.value, true)} className={inputCls} /></div>
        <div><label htmlFor="dt" className="eyebrow block">To</label>
          <input id="dt" type="date" value={f.to} onChange={(e) => set("to", e.target.value, true)} className={inputCls} /></div>
        <button className="min-h-10 border border-espresso px-5 text-xs font-semibold uppercase tracking-[0.14em] hover:bg-espresso hover:text-ivory">Search</button>
      </form>

      {error && !data ? <ErrorNote retry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <Empty>No bookings match these filters.</Empty>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Reference</th><th>Customer</th><th>Rental period</th><th>Status</th><th>Payment</th><th className="num">Total</th></tr></thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.reference}>
                  <td><Link href={`/admin/bookings/${b.reference}`} className="link-draw font-semibold">{b.reference}</Link></td>
                  <td>{b.customer}<span className="block text-xs text-ink-soft">{b.item_count} item{b.item_count === 1 ? "" : "s"}</span></td>
                  <td className="whitespace-nowrap">{formatDateTime(b.start_at, settings.timezone)}<span className="block text-xs text-ink-soft">to {formatDateTime(b.end_at, settings.timezone)}</span></td>
                  <td><Status value={b.status} /></td>
                  <td><Status value={b.payment_status} kind="payment" /></td>
                  <td className="num">{formatMoney(b.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
