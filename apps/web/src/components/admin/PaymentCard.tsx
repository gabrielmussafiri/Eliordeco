"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAction, useAdmin, post } from "@/lib/admin";
import { formatDateTime, formatMoney } from "@/lib/api";
import type { PaymentOut } from "@/lib/booking";
import { AuditDetails } from "./Audit";
import { inputCls } from "./ui";

export type AdminPayment = PaymentOut & {
  admin_notes?: string; booking_reference?: string; customer?: string; booking_total?: number;
};

const srcLabel: Record<string, string> = { customer: "Submitted by customer", admin_cash: "Cash recorded by staff", admin_external: "Recorded by staff" };

/** Vérification manuelle : seul un administrateur peut valider ; un reçu n'est jamais une preuve en soi. */
export function PaymentCard({ p, onChanged, showBooking = false }: { p: AdminPayment; onChanged: () => void; showBooking?: boolean }) {
  const { settings } = useAdmin();
  const [notes, setNotes] = useState(p.admin_notes ?? "");
  const [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const { busy, error, run } = useAction();

  const decide = (approve: boolean) => run(async () => {
    await post(`/api/admin/payments/${p.id}/review`, { approve, notes });
    setConfirm(null); onChanged();
  });

  return (
    <article className="border border-line bg-white/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {showBooking && p.booking_reference && (
            <p className="text-sm"><Link href={`/admin/bookings/${p.booking_reference}`} className="link-draw font-semibold">{p.booking_reference}</Link>
              <span className="text-ink-soft"> · {p.customer}</span></p>
          )}
          <p className="display mt-1 text-3xl">{formatMoney(p.amount)}
            {p.booking_total != null && <span className="text-base text-ink-soft"> of {formatMoney(p.booking_total)}</span>}</p>
          <p className="mt-1 text-sm text-ink-soft">{p.method} · paid {formatDateTime(p.paid_on, settings.timezone).split(",").slice(0, 2).join(",")}
            {p.transaction_reference && ` · ref ${p.transaction_reference}`}</p>
          <p className="text-xs text-ink-soft">{srcLabel[p.source] ?? p.source}</p>
        </div>
        <span className={`text-xs font-semibold uppercase tracking-[0.12em] ${p.status === "verified" ? "text-success" : p.status === "rejected" ? "text-danger" : ""}`}>{p.status}</span>
      </div>

      {p.evidence.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-3">
          {p.evidence.map((e) => e.content_type === "application/pdf" ? (
            <li key={e.id}><a href={`/api/admin/evidence/${e.id}`} target="_blank" rel="noopener noreferrer" className="link-draw text-sm">Open PDF receipt</a></li>
          ) : (
            <li key={e.id}>
              <a href={`/api/admin/evidence/${e.id}`} target="_blank" rel="noopener noreferrer" aria-label="Open receipt in a new tab">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/admin/evidence/${e.id}`} alt="Payment receipt submitted by the customer" className="h-40 w-auto max-w-full border border-line object-contain" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {p.source === "customer" && p.evidence.length === 0 && <p className="mt-3 text-xs text-ink-soft">No receipt attached.</p>}
      {p.source === "customer" && p.status === "submitted" && (
        <p className="mt-3 text-xs text-ink-soft">An uploaded receipt is not proof of payment — check your account before verifying.</p>
      )}

      {p.status === "submitted" ? (
        <div className="mt-4">
          <label htmlFor={`n${p.id}`} className="eyebrow block">Internal note</label>
          <input id={`n${p.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className={inputCls} />
          {confirm === null ? (
            <div className="mt-4 flex gap-3">
              <Button variant="olive" className="min-h-10" onClick={() => setConfirm("approve")}>Verify payment</Button>
              <Button variant="outline" className="min-h-10" onClick={() => setConfirm("reject")}>Reject</Button>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span>{confirm === "approve" ? `Confirm ${formatMoney(p.amount)} is in your account?` : "Reject this payment?"}</span>
              <Button className="min-h-10" disabled={busy} onClick={() => decide(confirm === "approve")}>{busy ? "Saving…" : "Yes, confirm"}</Button>
              <button className="link-draw" onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          )}
        </div>
      ) : p.admin_notes ? <p className="mt-3 text-sm"><span className="text-ink-soft">Note:</span> {p.admin_notes}</p> : null}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <AuditDetails type="payment" id={p.id} label="Audit trail" />
    </article>
  );
}
