"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, ErrorNote, Loading, PageHeader, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { patch, useAction, useAdmin, useAdminFetch } from "@/lib/admin";
import { formatDateTime, formatMoney } from "@/lib/api";

interface Cust {
  id: number; full_name: string; email: string; phone: string; internal_notes: string; booking_count: number;
  verified_total: number; outstanding: number; bookings: { reference: string; status: string; total: number; start_at: string }[];
}

export default function Customers() {
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const { data, error, reload } = useAdminFetch<Cust[]>(`/api/admin/customers${applied ? `?q=${encodeURIComponent(applied)}` : ""}`);
  return (
    <div>
      <PageHeader eyebrow="Relationships" title="Customers" />
      <form role="search" onSubmit={(e) => { e.preventDefault(); setApplied(q); }} className="mt-6 flex max-w-md items-end gap-4">
        <div className="flex-1"><label htmlFor="cq" className="eyebrow block">Search</label>
          <input id="cq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or phone" className={inputCls} /></div>
        <button className="min-h-10 border border-espresso px-5 text-xs font-semibold uppercase tracking-[0.14em] hover:bg-espresso hover:text-ivory">Search</button>
      </form>
      {error && !data ? <ErrorNote retry={reload} /> : !data ? <Loading /> : data.length === 0 ? <Empty>No customers found.</Empty> : (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {data.map((c) => <CustomerRow key={c.id} c={c} onSaved={reload} />)}
        </ul>
      )}
    </div>
  );
}

function CustomerRow({ c, onSaved }: { c: Cust; onSaved: () => void }) {
  const { settings } = useAdmin();
  const [notes, setNotes] = useState(c.internal_notes);
  const { busy, error, run } = useAction();
  return (
    <li>
      <details className="group py-4">
        <summary className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-4 sm:grid-cols-[2fr_1fr_1fr_1fr]">
          <span><strong>{c.full_name}</strong><span className="block text-sm text-ink-soft">{c.email} · {c.phone}</span></span>
          <span className="hidden text-sm sm:block">{c.booking_count} booking{c.booking_count === 1 ? "" : "s"}</span>
          <span className="hidden text-sm sm:block">{formatMoney(c.verified_total)} <span className="text-ink-soft">verified</span></span>
          <span className={`text-right text-sm sm:text-left ${c.outstanding > 0 ? "text-danger" : "text-ink-soft"}`}>{c.outstanding > 0 ? `${formatMoney(c.outstanding)} due` : "Settled"}</span>
        </summary>
        <div className="mt-5 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="eyebrow">Booking history</h3>
            <ul className="mt-3 space-y-1.5 text-sm">{c.bookings.map((b) => (
              <li key={b.reference} className="flex justify-between gap-4"><Link href={`/admin/bookings/${b.reference}`} className="link-draw font-semibold">{b.reference}</Link>
                <span className="text-ink-soft">{formatDateTime(b.start_at, settings.timezone).split(",").slice(0, 2).join(",")} · {b.status.replace("_", " ")}</span><span>{formatMoney(b.total)}</span></li>))}</ul>
          </div>
          <div>
            <label htmlFor={`cn${c.id}`} className="eyebrow block">Internal notes</label>
            <textarea id={`cn${c.id}`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} mt-2 border border-taupe p-3`} />
            <Button variant="outline" className="mt-3 min-h-10" disabled={busy || notes === c.internal_notes}
              onClick={() => run(async () => { await patch(`/api/admin/customers/${c.id}`, { internal_notes: notes }); onSaved(); })}>Save notes</Button>
            {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          </div>
        </div>
      </details>
    </li>
  );
}
