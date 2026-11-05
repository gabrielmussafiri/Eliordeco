import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { getProducts, getPublicSettings } from "@/lib/api";

export const metadata: Metadata = { title: "Book", description: "Request your rental in a few steps." };

export default function BookPage({ searchParams }: PageProps<"/book">) {
  return (
    <div className="shell pb-32 pt-12 md:pt-20">
      <p className="eyebrow rise">Booking request</p>
      <h1 className="display h-lg rise rise-2 mt-4 max-w-3xl">Tell us what you need, and <em>when</em></h1>
      <Suspense fallback={<div className="mt-14 h-96 animate-pulse bg-cream" aria-label="Loading booking form" />}>
        <Loaded searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Loaded({ searchParams }: { searchParams: PageProps<"/book">["searchParams"] }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const [products, settings] = await Promise.all([getProducts(), getPublicSettings()]);
  const item = products.find((p) => p.slug === one(sp.item));
  const qty = Math.max(1, Math.min(Number(one(sp.qty)) || 1, item?.total_quantity ?? 1));
  return (
    <BookingFlow products={products.filter((p) => p.total_quantity > 0)} settings={settings}
      initial={{ itemId: item?.id, qty, start: one(sp.start), end: one(sp.end) }} />
  );
}
