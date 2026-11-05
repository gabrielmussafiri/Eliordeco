"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { ApiError, api, type PublicSettings } from "./api";
import { UploadError } from "./image";

export interface Me { email: string; full_name: string; role: "owner" | "staff" }
export interface AdminSettings extends PublicSettings {
  payment_instructions: string; payment_methods: string[];
  bank_details: Record<string, string>; buffer_before_minutes: number; buffer_after_minutes: number;
}
export const AdminCtx = createContext<{ me: Me; settings: AdminSettings; reloadSettings: () => void } | null>(null);
export const useAdmin = () => {
  const c = useContext(AdminCtx);
  if (!c) throw new Error("useAdmin outside AdminShell");
  return c;
};

/** Lecture de données avec rechargement ; conserve les dernières données pendant un rafraîchissement.
 *  Une session expirée (401) renvoie vers la connexion. */
export function useAdminFetch<T>(path: string | null) {
  const [v, setV] = useState(0);
  const [last, setLast] = useState<{ key: string; data?: T; error?: ApiError; keep?: T } | null>(null);
  const key = `${path}|${v}`;
  useEffect(() => {
    if (!path) return;
    let off = false;
    api<T>(path)
      .then((data) => !off && setLast({ key, data }))
      .catch((error: ApiError) => {
        // Navigation complète voulue : on repart d'un état propre après expiration de session.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        if (error.status === 401) { window.location.href = "/admin/login"; return; }
        if (!off) setLast((p) => ({ key, error, keep: p?.data ?? p?.keep }));
      });
    return () => { off = true; };
  }, [key, path]);
  const cur = last && last.key === key ? last : null;
  return {
    data: (cur?.data ?? last?.data ?? last?.keep) as T | undefined,
    error: cur?.error, loading: !cur, reload: () => setV((x) => x + 1),
  };
}

/** Exécute une action d'écriture avec état « en cours » et message d'erreur. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run<R>(fn: () => Promise<R>): Promise<R | undefined> {
    setBusy(true); setError("");
    try { return await fn(); }
    catch (e) {
      if (e instanceof UploadError) { setError(e.message); return; }
      const d = (e as ApiError).detail as unknown;
      setError(typeof d === "string" ? d : Array.isArray(d) ? d.map((x: { msg?: string }) => x.msg).join(" · ")
        : d && typeof d === "object" && (d as { code?: string }).code === "insufficient_inventory"
          ? "Not enough stock available for those dates." : "Something went wrong.");
    } finally { setBusy(false); }
  }
  return { busy, error, run, clear: () => setError("") };
}

export const post = <T,>(path: string, json?: unknown) => api<T>(path, { method: "POST", json: json ?? {} });
export const put = <T,>(path: string, json: unknown) => api<T>(path, { method: "PUT", json });
export const patch = <T,>(path: string, json: unknown) => api<T>(path, { method: "PATCH", json });
export const del = (path: string) => api<void>(path, { method: "DELETE" });

// ───────── Types des réponses ─────────
export interface BookingRow {
  reference: string; status: string; payment_status: string; customer: string; start_at: string;
  end_at: string; total: number; item_count: number; created_at: string;
}
export interface BriefBooking { reference: string; customer: string; start_at: string; end_at: string }
export interface Dashboard {
  total_bookings: number; pending: number; confirmed: number; active: number; monthly_revenue: number;
  outstanding_balance: number; payments_to_review: number; upcoming_pickups: BriefBooking[];
  upcoming_returns: BriefBooking[]; inventory_alerts: { product: string; alert: string }[];
}
