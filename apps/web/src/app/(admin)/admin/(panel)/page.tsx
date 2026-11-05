"use client";

import Link from "next/link";
import { ErrorNote, Loading, PageHeader, Panel, Stat } from "@/components/admin/ui";
import { useAdmin, useAdminFetch, type BriefBooking, type Dashboard } from "@/lib/admin";
import { formatDateTime, formatMoney } from "@/lib/api";

export default function Overview() {
  const { settings, me } = useAdmin();
  const { data, error, reload } = useAdminFetch<Dashboard>("/api/admin/dashboard");
  const tz = settings.timezone;
  const today = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: tz }).format(new Date());

  if (error && !data) return <ErrorNote retry={reload} />;
  if (!data) return <Loading />;
  const attention = data.pending + data.payments_to_review;

  return (
    <div>
      <PageHeader eyebrow={today} title={`Good day, ${me.full_name.split(" ")[0]}`} />

      <section aria-label="Needs attention" className="mt-8 grid border border-espresso sm:grid-cols-3">
        <Stat label="Requests to review" value={data.pending} href="/admin/bookings?status=pending_review"
          hint={data.pending ? "Waiting for your decision" : "All caught up"} />
        <div className="border-t border-line sm:border-l sm:border-t-0">
          <Stat label="Payments to verify" value={data.payments_to_review} href="/admin/payments"
            hint={data.payments_to_review ? "Receipts awaiting review" : "Nothing waiting"} />
        </div>
        <div className="border-t border-line sm:border-l sm:border-t-0">
          <Stat label="Outstanding balance" value={formatMoney(data.outstanding_balance)} hint="Confirmed and active bookings" />
        </div>
      </section>
      {attention === 0 && <p className="mt-3 text-sm text-ink-soft">Nothing needs your attention right now.</p>}

      <section aria-label="Figures" className="mt-6 grid grid-cols-2 divide-x divide-line border border-line lg:grid-cols-4">
        <Stat label="All bookings" value={data.total_bookings} href="/admin/bookings" />
        <Stat label="Confirmed" value={data.confirmed} href="/admin/bookings?status=confirmed" />
        <Stat label="Out on rental" value={data.active} href="/admin/bookings?status=active" />
        <Stat label="Revenue this month" value={formatMoney(data.monthly_revenue)} hint="Verified payments only" />
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Panel title="Pick-ups, next 7 days" id="p"><BriefList rows={data.upcoming_pickups} field="start_at" tz={tz} empty="No pick-ups scheduled." /></Panel>
        <Panel title="Returns, next 7 days" id="r"><BriefList rows={data.upcoming_returns} field="end_at" tz={tz} empty="No returns due." /></Panel>
      </div>

      <div className="mt-6">
        <Panel title="Inventory alerts" id="a">
          {data.inventory_alerts.length === 0 ? <p className="text-sm text-ink-soft">No alerts.</p> : (
            <ul className="divide-y divide-line text-sm">
              {data.inventory_alerts.map((a, i) => <li key={i} className="flex justify-between py-2.5"><span>{a.product}</span><span className="text-danger">{a.alert}</span></li>)}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function BriefList({ rows, field, tz, empty }: { rows: BriefBooking[]; field: "start_at" | "end_at"; tz: string; empty: string }) {
  if (!rows.length) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {rows.map((b) => (
        <li key={b.reference} className="flex items-center justify-between gap-4 py-3">
          <div><Link href={`/admin/bookings/${b.reference}`} className="link-draw font-semibold">{b.reference}</Link>
            <p className="text-ink-soft">{b.customer}</p></div>
          <time dateTime={b[field]} className="text-right">{formatDateTime(b[field], tz)}</time>
        </li>
      ))}
    </ul>
  );
}
