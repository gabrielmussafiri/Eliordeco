"use client";

import { useState } from "react";
import { useAdmin, useAdminFetch } from "@/lib/admin";
import { formatDateTime } from "@/lib/api";

interface Entry { id: number; user_id: number | null; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; created_at: string }

function List({ type, id }: { type: string; id: number }) {
  const { settings } = useAdmin();
  const { data, error } = useAdminFetch<Entry[]>(`/api/admin/audit?entity_type=${type}&entity_id=${id}`);
  if (error) return <p className="text-xs text-danger">Couldn&rsquo;t load history.</p>;
  if (!data) return <p className="text-xs text-ink-soft">Loading…</p>;
  if (!data.length) return <p className="text-xs text-ink-soft">No recorded changes.</p>;
  return (
    <ol className="space-y-2 text-xs">
      {data.map((e) => (
        <li key={e.id} className="grid grid-cols-[9rem_1fr] gap-3">
          <time className="text-ink-soft" dateTime={e.created_at}>{formatDateTime(e.created_at, settings.timezone)}</time>
          <span><strong>{e.action}</strong>{e.before || e.after ? <span className="text-ink-soft"> — {summary(e)}</span> : null}
            <span className="text-ink-soft">{e.user_id ? ` · staff #${e.user_id}` : " · customer / system"}</span></span>
        </li>
      ))}
    </ol>
  );
}
const summary = (e: Entry) => {
  const b = e.before ?? {}, a = e.after ?? {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return keys.map((k) => (k in b ? `${k}: ${String(b[k])} → ${String(a[k])}` : `${k}: ${String(a[k])}`)).join(", ");
};

/** Journal d'audit chargé à l'ouverture seulement. */
export function AuditDetails({ type, id, label = "History" }: { type: string; id: number; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="mt-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">{label}</summary>
      <div className="mt-3">{open && <List type={type} id={id} />}</div>
    </details>
  );
}
