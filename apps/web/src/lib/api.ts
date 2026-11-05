export type PricingUnit = "hour" | "day" | "weekend" | "week";

export interface Category { id: number; name: string; slug: string; sort_order: number }
export interface ProductImage { id: number; url: string; alt: string }
export interface Product {
  id: number; name: string; slug: string; description: string;
  specifications: Record<string, string>; rental_conditions: string;
  unit_price: number; pricing_unit: PricingUnit; security_deposit: number;
  total_quantity: number; is_active: boolean; category: Category | null; images: ProductImage[];
}
export interface PublicSettings {
  business_name: string; contact_email: string; whatsapp_number: string; business_address: string;
  timezone: string; currency: string; operating_hours: Record<string, string>;
  rental_policies: string; cancellation_policy: string; delivery_enabled: boolean;
  delivery_fee: string; deposit_percentage: number; pending_expiry_hours: number;
}

export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(typeof detail === "string" ? detail : `API error ${status}`);
  }
}

// Côté serveur : appel direct à FastAPI. Côté navigateur : même origine (rewrite Next).
const base = () => (typeof window === "undefined" ? (process.env.API_URL ?? "http://localhost:8000").replace(/\/+$/, "") : "");

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(base() + path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      // Requis par l'API pour toute requête modifiante authentifiée (protection CSRF)
      "X-Requested-With": "eld",
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "include",
  });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch {}
    throw new ApiError(res.status, detail);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const getPublicSettings = () => api<PublicSettings>("/api/settings/public");
export const getCategories = () => api<Category[]>("/api/categories");
export const getProducts = (params: Record<string, string> = {}) =>
  api<Product[]>("/api/products?" + new URLSearchParams(params));
export const getProduct = (slug: string) => api<Product>(`/api/products/${encodeURIComponent(slug)}`);

// ───────── Formatage ─────────
export const formatMoney = (n: number | string, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(n));

export const unitLabel: Record<PricingUnit, string> = {
  hour: "hour", day: "day", weekend: "weekend", week: "week",
};

/** Les horodatages arrivent en UTC ; l'affichage suit le fuseau de l'entreprise. */
export const formatDateTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));

export const waLink = (number: string, text: string) => {
  const digits = number.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
};

/** Photo d'ouverture (fichier du propriétaire dans public/images). */
export const HERO_IMAGE = "/images/hero.jpg";
