"use client";

import { useState } from "react";
import { PaymentCard, type AdminPayment } from "@/components/admin/PaymentCard";
import { Empty, ErrorNote, Loading, PageHeader } from "@/components/admin/ui";
import { useAdminFetch } from "@/lib/admin";

const TABS = [["submitted", "To verify"], ["verified", "Verified"], ["rejected", "Rejected"], ["", "All"]] as const;

export default function Payments() {
  const [tab, setTab] = useState<string>("submitted");
  const { data, error, reload } = useAdminFetch<AdminPayment[]>(`/api/admin/payments${tab ? `?status=${tab}` : ""}`);
  return (
    <div>
      <PageHeader eyebrow="Manual verification" title="Payments" />
      <div role="tablist" aria-label="Payment status" className="mt-6 flex gap-8 border-b border-line">
        {TABS.map(([v, l]) => (
          <button key={l} role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
            className={`-mb-px border-b-2 py-3 text-[0.8rem] font-semibold uppercase tracking-[0.12em] ${tab === v ? "border-espresso" : "border-transparent text-ink-soft"}`}>{l}</button>
        ))}
      </div>
      {error && !data ? <ErrorNote retry={reload} /> : !data ? <Loading /> : data.length === 0 ? (
        <Empty>{tab === "submitted" ? "No payments waiting for verification." : "Nothing here."}</Empty>
      ) : (
        <div className="mt-8 grid gap-5 2xl:grid-cols-2">
          {data.map((p) => <PaymentCard key={p.id} p={p} showBooking onChanged={reload} />)}
        </div>
      )}
    </div>
  );
}
