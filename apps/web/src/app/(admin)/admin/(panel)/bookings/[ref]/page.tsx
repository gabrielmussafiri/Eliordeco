"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AuditDetails } from "@/components/admin/Audit";
import { PaymentCard, type AdminPayment } from "@/components/admin/PaymentCard";
import { ErrorNote, Loading, PageHeader, Panel, Status, inputCls, selectCls } from "@/components/admin/ui";
import { Button, ButtonLink } from "@/components/ui/Button";
import { patch, post, useAction, useAdmin, useAdminFetch } from "@/lib/admin";
import { formatDateTime, formatMoney, unitLabel } from "@/lib/api";
import type { BookingView } from "@/lib/booking";
import { TIME_SLOTS, isoToZoned, zonedToUtcISO } from "@/lib/time";

type AdminBooking = Omit<BookingView, "delivery" | "payments"> & {
  id: number; internal_notes: string; rejection_reason: string | null; whatsapp_customer_url: string | null;
  delivery: { address: string | null; instructions: string; status: string; delivery_at: string | null; return_at: string | null } | null;
  payments: AdminPayment[];
};

const NEXT: Record<string, { to: string; label: string; tone?: "primary" | "outline" }[]> = {
  pending_review: [{ to: "confirmed", label: "Approve request" }],
  confirmed: [{ to: "active", label: "Mark picked up / out", tone: "outline" }],
  active: [{ to: "completed", label: "Mark returned & complete" }],
};
const FULFILL = ["scheduled", "out_for_delivery", "delivered", "return_scheduled", "returned"];

export default function BookingDetail() {
  const { ref } = useParams<{ ref: string }>();
  const { settings } = useAdmin();
  const { data: b, error, reload } = useAdminFetch<AdminBooking>(`/api/admin/bookings/${ref}`);
  const tz = settings.timezone;

  if (error && !b) return <ErrorNote message={error.status === 404 ? "Booking not found." : undefined} retry={reload} />;
  if (!b) return <Loading />;
  const open = ["pending_review", "confirmed", "active"].includes(b.status);

  return (
    <div>
      <p className="mb-4 text-sm"><Link href="/admin/bookings" className="link-draw">← Bookings</Link></p>
      <PageHeader eyebrow={`Booked ${formatDateTime(b.created_at, tz)}`} title={b.reference}
        actions={<><Status value={b.status} /> <span className="text-taupe">·</span> <Status value={b.payment_status} kind="payment" /></>} />

      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <Transitions b={b} onDone={reload} />

          <Panel title="Rental" id="rental" actions={open && <Reschedule b={b} onDone={reload} />}>
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-ink-soft">Pick-up</dt><dd>{formatDateTime(b.start_at, tz)}</dd></div>
              <div><dt className="text-ink-soft">Return</dt><dd>{formatDateTime(b.end_at, tz)}</dd></div>
              <div><dt className="text-ink-soft">Fulfilment</dt><dd className="capitalize">{b.fulfillment_method}</dd></div>
              {b.event_type && <div><dt className="text-ink-soft">Event</dt><dd>{b.event_type}</dd></div>}
              {b.instructions && <div className="sm:col-span-2"><dt className="text-ink-soft">Customer notes</dt><dd>{b.instructions}</dd></div>}
              {b.rejection_reason && <div className="sm:col-span-2"><dt className="text-ink-soft">Rejection reason</dt><dd>{b.rejection_reason}</dd></div>}
            </dl>
            <div className="mt-6 overflow-x-auto"><table className="tbl">
              <thead><tr><th>Item</th><th className="num">Qty</th><th className="num max-sm:hidden">Rate</th><th className="num max-sm:hidden">Units</th><th className="num">Total</th></tr></thead>
              <tbody>{b.items.map((i) => (
                <tr key={i.product_name}><td>{i.product_name}</td><td className="num">{i.quantity}</td>
                  <td className="num max-sm:hidden">{formatMoney(i.unit_price)}/{unitLabel[i.pricing_unit]}</td><td className="num max-sm:hidden">{i.billable_units}</td>
                  <td className="num">{formatMoney(i.line_total)}</td></tr>))}</tbody>
            </table></div>
          </Panel>

          <Panel title="Payments" id="pay">
            {b.payments.length === 0 && <p className="text-sm text-ink-soft">No payments yet.</p>}
            <div className="space-y-4">{b.payments.map((p) => <PaymentCard key={p.id} p={p} onChanged={reload} />)}</div>
            {open && b.balance > 0 && <RecordPayment b={b} onDone={reload} />}
          </Panel>

          {(b.fulfillment_method === "delivery" || b.delivery) && <Delivery b={b} onDone={reload} />}
          <Notes b={b} onDone={reload} />
          <Panel title="Booking history" id="h"><AuditDetails type="booking" id={b.id} label="Show changes" /></Panel>
        </div>

        <aside className="min-w-0 space-y-6">
          <Panel title="Customer" id="cust">
            <p className="font-semibold">{b.customer.full_name}</p>
            <p className="text-sm"><a href={`mailto:${b.customer.email}`} className="link-draw break-all">{b.customer.email}</a></p>
            <p className="text-sm text-ink-soft">{b.customer.phone}</p>
            {b.whatsapp_customer_url && (
              <ButtonLink href={b.whatsapp_customer_url} variant="outline" className="mt-4 w-full min-h-10" target="_blank" rel="noopener noreferrer">WhatsApp customer</ButtonLink>
            )}
          </Panel>
          <Panel title="Totals" id="tot">
            <dl className="space-y-2 text-sm">
              <Row k="Rental" v={formatMoney(b.subtotal)} />
              <Row k="Delivery" v={formatMoney(b.delivery_fee)} />
              <Row k="Security deposit" v={formatMoney(b.deposit_amount)} />
              <Row k="Total" v={formatMoney(b.total)} bold />
              <Row k="Verified payments" v={formatMoney(b.verified_total)} />
              <Row k="Balance due" v={formatMoney(b.balance)} bold />
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

const Row = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) =>
  <div className={`flex justify-between ${bold ? "border-t border-line pt-2 font-semibold" : ""}`}><dt className={bold ? "" : "text-ink-soft"}>{k}</dt><dd>{v}</dd></div>;

function Transitions({ b, onDone }: { b: AdminBooking; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [mode, setMode] = useState<"reject" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const set = (status: string, why?: string) => run(async () => { await post(`/api/admin/bookings/${b.reference}/status`, { status, reason: why }); setMode(null); onDone(); });
  const next = NEXT[b.status] ?? [];
  const canCancel = ["pending_review", "confirmed"].includes(b.status);
  if (!next.length && !canCancel && b.status !== "pending_review") return null;

  return (
    <div className="border border-espresso bg-cream/60 p-5">
      <div className="flex flex-wrap items-center gap-3">
        {next.map((n) => <Button key={n.to} variant={n.tone ?? "primary"} className="min-h-10" disabled={busy} onClick={() => set(n.to)}>{busy ? "Saving…" : n.label}</Button>)}
        {b.status === "pending_review" && <Button variant="outline" className="min-h-10" onClick={() => setMode("reject")}>Reject</Button>}
        {canCancel && <Button variant="quiet" onClick={() => setMode("cancel")}>Cancel booking</Button>}
      </div>
      {b.status === "pending_review" && <p className="mt-3 text-xs text-ink-soft">Approving confirms the booking. It does not mark anything as paid.</p>}
      {mode && (
        <div className="mt-4">
          <label htmlFor="why" className="eyebrow block">{mode === "reject" ? "Reason (shown to you only)" : "Why is it being cancelled?"}</label>
          <input id="why" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} maxLength={1000} />
          <p className="mt-2 text-xs text-ink-soft">This releases the reserved stock for these dates.</p>
          <div className="mt-3 flex gap-4">
            <Button className="min-h-10" disabled={busy} onClick={() => set(mode === "reject" ? "rejected" : "cancelled", reason)}>{mode === "reject" ? "Reject request" : "Cancel booking"}</Button>
            <button className="link-draw text-sm" onClick={() => setMode(null)}>Keep booking</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}

function Reschedule({ b, onDone }: { b: AdminBooking; onDone: () => void }) {
  const { settings } = useAdmin();
  const [open, setOpen] = useState(false);
  const s = isoToZoned(b.start_at, settings.timezone), e = isoToZoned(b.end_at, settings.timezone);
  const [v, setV] = useState({ sd: s.date, st: s.time, ed: e.date, et: e.time });
  const { busy, error, run } = useAction();
  if (!open) return <button className="link-draw text-xs font-semibold uppercase tracking-[0.12em]" onClick={() => setOpen(true)}>Reschedule</button>;
  const save = () => run(async () => {
    await post(`/api/admin/bookings/${b.reference}/reschedule`, {
      start_at: zonedToUtcISO(v.sd, v.st, settings.timezone), end_at: zonedToUtcISO(v.ed, v.et, settings.timezone) });
    setOpen(false); onDone();
  });
  return (
    <div className="w-full basis-full border-t border-line pt-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <input aria-label="Pick-up date" type="date" value={v.sd} onChange={(x) => setV({ ...v, sd: x.target.value })} className={inputCls} />
        <select aria-label="Pick-up time" value={v.st} onChange={(x) => setV({ ...v, st: x.target.value })} className={selectCls}>{TIME_SLOTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        <input aria-label="Return date" type="date" value={v.ed} onChange={(x) => setV({ ...v, ed: x.target.value })} className={inputCls} />
        <select aria-label="Return time" value={v.et} onChange={(x) => setV({ ...v, et: x.target.value })} className={selectCls}>{TIME_SLOTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
      </div>
      <p className="mt-2 text-xs text-ink-soft">Availability is re-checked and the total is recalculated at the original unit prices.</p>
      <div className="mt-3 flex gap-4"><Button className="min-h-10" disabled={busy} onClick={save}>{busy ? "Checking…" : "Save new dates"}</Button>
        <button className="link-draw text-sm" onClick={() => setOpen(false)}>Cancel</button></div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

function RecordPayment({ b, onDone }: { b: AdminBooking; onDone: () => void }) {
  const { settings } = useAdmin();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ amount: b.balance.toFixed(2), method: "Cash", cash: true, notes: "", date: new Date().toISOString().slice(0, 10) });
  const { busy, error, run } = useAction();
  if (!open) return <Button variant="outline" className="mt-5 min-h-10" onClick={() => setOpen(true)}>Record a payment received</Button>;
  const save = () => run(async () => {
    await post(`/api/admin/bookings/${b.reference}/payments`, {
      amount: v.amount, method: v.method, cash: v.cash, notes: v.notes, paid_on: zonedToUtcISO(v.date, "12:00", settings.timezone) });
    setOpen(false); onDone();
  });
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="eyebrow">Record a payment (verified immediately)</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <div><label htmlFor="ra" className="eyebrow block">Amount</label><input id="ra" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value.replace(/[^\d.]/g, "") })} className={inputCls} /></div>
        <div><label htmlFor="rm" className="eyebrow block">Method</label>
          <select id="rm" value={v.method} onChange={(e) => setV({ ...v, method: e.target.value, cash: e.target.value === "Cash" })} className={selectCls}>
            {[...new Set(["Cash", ...settings.payment_methods])].map((m) => <option key={m}>{m}</option>)}</select></div>
        <div><label htmlFor="rd" className="eyebrow block">Date</label><input id="rd" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className={inputCls} /></div>
        <div><label htmlFor="rn" className="eyebrow block">Note</label><input id="rn" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className={inputCls} /></div>
      </div>
      <div className="mt-4 flex gap-4"><Button className="min-h-10" disabled={busy} onClick={save}>{busy ? "Saving…" : "Record payment"}</Button>
        <button className="link-draw text-sm" onClick={() => setOpen(false)}>Cancel</button></div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

function Delivery({ b, onDone }: { b: AdminBooking; onDone: () => void }) {
  const { settings } = useAdmin();
  const d = b.delivery;
  const [v, setV] = useState({ address: d?.address ?? "", instructions: d?.instructions ?? "", status: d?.status ?? "scheduled", fee: String(b.delivery_fee) });
  const { busy, error, run } = useAction();
  const save = () => run(async () => {
    await patch(`/api/admin/bookings/${b.reference}/delivery`, { address: v.address, instructions: v.instructions, status: v.status });
    if (Number(v.fee) !== b.delivery_fee) await patch(`/api/admin/bookings/${b.reference}`, { delivery_fee: v.fee });
    onDone();
  });
  return (
    <Panel title="Delivery & pick-up" id="del">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2"><label htmlFor="da" className="eyebrow block">Address</label><input id="da" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} className={inputCls} /></div>
        <div><label htmlFor="ds" className="eyebrow block">Fulfilment status</label>
          <select id="ds" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })} className={selectCls}>{FULFILL.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select></div>
        <div><label htmlFor="df" className="eyebrow block">Delivery charge (USD)</label><input id="df" inputMode="decimal" value={v.fee} onChange={(e) => setV({ ...v, fee: e.target.value.replace(/[^\d.]/g, "") })} className={inputCls} /></div>
        <div className="sm:col-span-2"><label htmlFor="di" className="eyebrow block">Instructions</label><input id="di" value={v.instructions} onChange={(e) => setV({ ...v, instructions: e.target.value })} className={inputCls} /></div>
      </div>
      <p className="mt-3 text-xs text-ink-soft">Scheduled for {formatDateTime(b.start_at, settings.timezone)} · return {formatDateTime(b.end_at, settings.timezone)}</p>
      <Button className="mt-4 min-h-10" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save delivery details"}</Button>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </Panel>
  );
}

function Notes({ b, onDone }: { b: AdminBooking; onDone: () => void }) {
  const [n, setN] = useState(b.internal_notes);
  const { busy, error, run } = useAction();
  return (
    <Panel title="Internal notes" id="notes">
      <label htmlFor="in" className="sr-only">Internal notes</label>
      <textarea id="in" rows={3} value={n} onChange={(e) => setN(e.target.value)} maxLength={5000} className={`${inputCls} border border-taupe p-3`} />
      <Button variant="outline" className="mt-3 min-h-10" disabled={busy || n === b.internal_notes}
        onClick={() => run(async () => { await patch(`/api/admin/bookings/${b.reference}`, { internal_notes: n }); onDone(); })}>Save notes</Button>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </Panel>
  );
}
