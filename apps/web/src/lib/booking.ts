import { ApiError, type PricingUnit } from "./api";
import { UploadError } from "./image";

export interface QuoteLine {
  product_id: number; product_name: string; quantity: number; unit_price: number;
  pricing_unit: PricingUnit; billable_units: number; deposit: number; line_total: number;
}
export interface Quote { lines: QuoteLine[]; subtotal: number; delivery_fee: number; deposit_amount: number; total: number }

export interface PaymentOut {
  id: number; amount: number; method: string; paid_on: string; transaction_reference: string | null;
  status: "submitted" | "verified" | "rejected" | "refunded"; source: string; created_at: string;
  evidence: { id: number; content_type: string }[];
}
export interface BookingView {
  reference: string; status: string; payment_status: string; start_at: string; end_at: string;
  event_type: string | null; instructions: string; fulfillment_method: "pickup" | "delivery";
  subtotal: number; delivery_fee: number; deposit_amount: number; total: number; verified_total: number;
  balance: number; created_at: string; whatsapp_url: string | null;
  customer: { full_name: string; email: string; phone: string };
  items: QuoteLine[];
  delivery: { address: string | null; instructions: string; status: string } | null;
  payments: PaymentOut[];
  payment_info?: {
    instructions: string; methods: string[]; deposit_percentage: number;
    bank_details: Record<string, string>;
  };
}

export const bookingStatusLabel: Record<string, string> = {
  pending_review: "Pending review", confirmed: "Confirmed", active: "Out on rental", completed: "Completed",
  rejected: "Not accepted", cancelled: "Cancelled", expired: "Expired",
};
export const paymentStatusLabel: Record<string, string> = {
  unpaid: "Unpaid", submitted: "Payment submitted — awaiting verification", partially_paid: "Partially paid",
  verified: "Paid in full", rejected: "Payment not accepted", refunded: "Refunded",
};

/** Message lisible à partir des formes d'erreur de l'API (texte, validation Pydantic, stock insuffisant). */
export function errorMessage(e: unknown): string {
  if (e instanceof UploadError) return e.message;
  if (e instanceof ApiError) {
    const d = e.detail as unknown;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x: { loc?: string[]; msg?: string }) => `${x.loc?.slice(-1)[0] ?? "field"}: ${x.msg}`).join(" · ");
    if (d && typeof d === "object" && (d as { code?: string }).code === "insufficient_inventory")
      return "Some of the selected pieces are no longer available for these dates.";
    if (e.status === 429) return "Too many attempts. Please wait a minute and try again.";
  }
  return "Something went wrong. Please try again.";
}

// ───────── Stockage local des accès (jeton secret) ─────────
// Le jeton ne voyage jamais dans l'URL envoyée au serveur : il est dans le fragment (#t=…).
const KEY = "eld-bookings";
export type Saved = Record<string, string>; // référence → jeton

export const readSaved = (raw: string | null): Saved => {
  try { return raw ? (JSON.parse(raw) as Saved) : {}; } catch { return {}; }
};
export function saveAccess(ref: string, token: string) {
  const all = readSaved(localStorage.getItem(KEY));
  all[ref] = token;
  localStorage.setItem(KEY, JSON.stringify(all));
  window.dispatchEvent(new Event("eld-saved"));
}
export const SAVED_KEY = KEY;
export function subscribeSaved(cb: () => void) {
  window.addEventListener("eld-saved", cb);
  window.addEventListener("storage", cb);
  window.addEventListener("hashchange", cb);
  return () => {
    window.removeEventListener("eld-saved", cb);
    window.removeEventListener("storage", cb);
    window.removeEventListener("hashchange", cb);
  };
}
