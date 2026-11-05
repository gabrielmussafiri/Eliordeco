"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorNote, Loading, PageHeader } from "@/components/admin/ui";
import { useAdmin, useAdminFetch } from "@/lib/admin";
import { isoToZoned, todayIn, zonedToUtcISO } from "@/lib/time";

interface Cal {
  bookings: { reference: string; status: string; customer: string; start_at: string; end_at: string; fulfillment: string; items: { name: string; quantity: number }[] }[];
  maintenance: { id: number; product_id: number; start_at: string; end_at: string; reason: string; is_damage: boolean; quantity: number }[];
}
interface Inv { product_id: number; name: string; total: number; days: { date: string; remaining: number }[] }
type View = "day" | "week" | "month";
type Ev = { kind: "pickup" | "return" | "maint"; time: string; label: string; ref?: string; sub: string; sort: string };

const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const dow = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); };
const label = (d: string, o: Intl.DateTimeFormatOptions) => { const [y, m, dd] = d.split("-").map(Number); return new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, dd))); };
const hm = (t: string) => new Date(2000, 0, 1, +t.slice(0, 2), +t.slice(3)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function CalendarPage() {
  const { settings } = useAdmin();
  const tz = settings.timezone;
  const today = todayIn(tz);
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(today);

  const first = view === "month" ? addDays(anchor.slice(0, 8) + "01", -dow(anchor.slice(0, 8) + "01"))
    : view === "week" ? addDays(anchor, -dow(anchor)) : anchor;
  const count = view === "month" ? 42 : view === "week" ? 7 : 1;
  const days = Array.from({ length: count }, (_, i) => addDays(first, i));
  const startISO = zonedToUtcISO(first, "00:00", tz), endISO = zonedToUtcISO(addDays(first, count), "00:00", tz);

  const cal = useAdminFetch<Cal>(`/api/admin/calendar?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`);
  const inv = useAdminFetch<Inv[]>(view === "month" ? null : `/api/admin/calendar/inventory?day_from=${first}&days=${count}`);

  const byDay = new Map<string, Ev[]>();
  const push = (d: string, e: Ev) => byDay.set(d, [...(byDay.get(d) ?? []), e]);
  for (const b of cal.data?.bookings ?? []) {
    const s = isoToZoned(b.start_at, tz), e = isoToZoned(b.end_at, tz);
    const sub = b.items.map((i) => `${i.quantity}× ${i.name}`).join(", ");
    push(s.date, { kind: "pickup", time: s.time, label: b.customer, ref: b.reference, sub, sort: s.time });
    push(e.date, { kind: "return", time: e.time, label: b.customer, ref: b.reference, sub, sort: e.time });
  }
  const names = new Map((inv.data ?? []).map((p) => [p.product_id, p.name]));
  for (const m of cal.data?.maintenance ?? []) {
    const s = isoToZoned(m.start_at, tz), e = isoToZoned(m.end_at, tz);
    for (let d = s.date; d <= e.date && d < addDays(first, count); d = addDays(d, 1)) {
      push(d, { kind: "maint", time: d === s.date ? s.time : "00:00", label: m.is_damage ? "Damaged" : "Maintenance", sub: m.reason || names.get(m.product_id) || `Product #${m.product_id}`, sort: d === s.date ? s.time : "00:00" });
    }
  }
  for (const list of byDay.values()) list.sort((a, b) => a.sort.localeCompare(b.sort));

  const step = (dir: 1 | -1) => setAnchor(view === "month" ? addDays(anchor.slice(0, 8) + "01", dir === 1 ? 32 : -1).slice(0, 8) + "01" : addDays(anchor, dir * (view === "week" ? 7 : 1)));
  const title = view === "month" ? label(anchor, { month: "long", year: "numeric" })
    : view === "week" ? `${label(first, { month: "short", day: "numeric" })} – ${label(addDays(first, 6), { month: "short", day: "numeric", year: "numeric" })}`
    : label(anchor, { dateStyle: "full" });

  return (
    <div>
      <PageHeader eyebrow="Operations" title="Calendar" />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button aria-label="Previous" onClick={() => step(-1)} className="h-10 w-10 border border-taupe hover:bg-cream">‹</button>
          <button onClick={() => setAnchor(today)} className="h-10 border border-taupe px-4 text-xs font-semibold uppercase tracking-[0.12em] hover:bg-cream">Today</button>
          <button aria-label="Next" onClick={() => step(1)} className="h-10 w-10 border border-taupe hover:bg-cream">›</button>
          <h2 className="display ml-3 text-3xl" aria-live="polite">{title}</h2>
        </div>
        <div role="group" aria-label="View" className="flex border border-espresso">
          {(["day", "week", "month"] as const).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}
              className={`px-5 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${view === v ? "bg-espresso text-ivory" : "hover:bg-cream"}`}>{v}</button>))}
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-soft">▲ pick-up · ▼ return · maintenance blocks stock · times in {tz.replace("_", " ")}</p>

      {cal.error && !cal.data ? <ErrorNote retry={cal.reload} /> : !cal.data ? <Loading /> : view === "day" ? (
        <DayList date={anchor} events={byDay.get(anchor) ?? []} />
      ) : (
        <>
        <Agenda days={days.filter((d) => view === "week" || d.slice(0, 7) === anchor.slice(0, 7))} byDay={byDay}
          onOpen={(d) => { setAnchor(d); setView("day"); }} />
        <div className="mt-5 hidden overflow-x-auto md:block">
          <div className="grid min-w-[44rem] grid-cols-7 border-l border-t border-line">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="eyebrow border-b border-r border-line bg-cream/60 px-2 py-2">{d}</div>)}
            {days.map((d) => {
              const evs = byDay.get(d) ?? [];
              const muted = view === "month" && d.slice(0, 7) !== anchor.slice(0, 7);
              const shown = view === "month" ? evs.slice(0, 3) : evs;
              return (
                <div key={d} className={`border-b border-r border-line p-2 ${view === "week" ? "min-h-64" : "min-h-28"} ${muted ? "bg-cream/40 text-ink-soft" : ""} ${d === today ? "bg-olive/10" : ""}`}>
                  <button onClick={() => { setAnchor(d); setView("day"); }} aria-label={`Open ${label(d, { dateStyle: "full" })}`}
                    className={`text-xs font-semibold ${d === today ? "text-olive-deep underline underline-offset-4" : ""}`}>{label(d, { day: "numeric" })}</button>
                  <ul className="mt-1 space-y-1">
                    {shown.map((e, i) => <li key={i}><EventLine e={e} compact /></li>)}
                    {evs.length > shown.length && <li className="text-[0.7rem] text-ink-soft">+{evs.length - shown.length} more</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
        </>
      )}

      {view !== "month" && inv.data && <InventoryMatrix data={inv.data} days={days} />}
    </div>
  );
}

/** Téléphone : liste chronologique des jours qui ont des événements, plutôt qu'une grille de 7 colonnes. */
function Agenda({ days, byDay, onOpen }: { days: string[]; byDay: Map<string, Ev[]>; onOpen: (d: string) => void }) {
  const busy = days.filter((d) => (byDay.get(d) ?? []).length > 0);
  if (!busy.length) return <p className="mt-8 text-sm text-ink-soft md:hidden">Nothing scheduled in this period.</p>;
  return (
    <ol className="mt-6 divide-y divide-line border-y border-line md:hidden" aria-label="Agenda">
      {busy.map((d) => (
        <li key={d} className="py-4">
          <button onClick={() => onOpen(d)} className="display text-2xl">{label(d, { weekday: "long", month: "short", day: "numeric" })}</button>
          <ul className="mt-2 space-y-3">{(byDay.get(d) ?? []).map((e, i) => <li key={i} className="text-sm"><EventLine e={e} /></li>)}</ul>
        </li>
      ))}
    </ol>
  );
}

function EventLine({ e, compact }: { e: Ev; compact?: boolean }) {
  const mark = e.kind === "pickup" ? "▲" : e.kind === "return" ? "▼" : "■";
  const cls = e.kind === "pickup" ? "text-olive-deep" : e.kind === "return" ? "text-espresso" : "text-danger";
  const inner = <><span aria-hidden className={cls}>{mark}</span> <span className="tabular-nums text-ink-soft">{hm(e.time)}</span> {e.label}
    {!compact && <span className="block pl-4 text-xs text-ink-soft">{e.sub}</span>}</>;
  const sr = <span className="sr-only">{e.kind === "pickup" ? "Pick-up" : e.kind === "return" ? "Return" : "Maintenance"}</span>;
  return e.ref ? <Link href={`/admin/bookings/${e.ref}`} className="block text-[0.74rem] leading-snug hover:underline">{sr}{inner}</Link>
    : <span className="block text-[0.74rem] leading-snug">{sr}{inner}</span>;
}

function DayList({ date, events }: { date: string; events: Ev[] }) {
  return (
    <section className="mt-6 max-w-2xl" aria-label={`Schedule for ${label(date, { dateStyle: "full" })}`}>
      {events.length === 0 ? <p className="py-10 text-sm text-ink-soft">Nothing scheduled this day.</p> : (
        <ul className="divide-y divide-line border-y border-line">{events.map((e, i) => <li key={i} className="py-3 text-sm"><EventLine e={e} /></li>)}</ul>
      )}
    </section>
  );
}

function InventoryMatrix({ data, days }: { data: Inv[]; days: string[] }) {
  return (
    <section className="mt-10" aria-labelledby="inv-h">
      <h2 id="inv-h" className="eyebrow">Inventory remaining</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Product</th>{days.map((d) => <th key={d} className="num">{label(d, { weekday: "short", day: "numeric" })}</th>)}</tr></thead>
          <tbody>{data.map((p) => (
            <tr key={p.product_id}><td>{p.name} <span className="text-ink-soft">/ {p.total}</span></td>
              {p.days.map((d) => <td key={d.date} className={`num ${d.remaining === 0 ? "font-semibold text-danger" : d.remaining < p.total ? "" : "text-ink-soft"}`}>{d.remaining}</td>)}</tr>))}</tbody>
        </table>
      </div>
    </section>
  );
}
