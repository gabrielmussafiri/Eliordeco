import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AvailabilityPanel } from "@/components/catalog/AvailabilityPanel";
import { Gallery } from "@/components/catalog/Gallery";
import { ApiError, formatMoney, getProduct, getPublicSettings, unitLabel, api } from "@/lib/api";

async function load(slug: string) {
  try { return await getProduct(slug); }
  catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
}

export async function generateMetadata({ params }: PageProps<"/rentals/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  return { title: p.name, description: p.description.slice(0, 155) };
}

export default function ProductPage({ params }: PageProps<"/rentals/[slug]">) {
  return (
    <Suspense fallback={<div className="shell py-24"><div className="h-[40rem] animate-pulse bg-cream" aria-label="Loading product" /></div>}>
      <Product params={params} />
    </Suspense>
  );
}

async function Product({ params }: { params: PageProps<"/rentals/[slug]">["params"] }) {
  const { slug } = await params;
  const [p, settings, wa] = await Promise.all([
    load(slug), getPublicSettings(), api<{ url: string | null }>(`/api/products/${encodeURIComponent(slug)}/whatsapp`),
  ]);
  const specs = Object.entries(p.specifications ?? {});

  return (
    <article className="shell pb-32 pt-8 md:pt-12">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-soft">
        <Link href="/rentals" className="link-draw">Collection</Link>
        {p.category && <> <span aria-hidden>/</span> <Link href={`/rentals?category=${p.category.slug}`} className="link-draw">{p.category.name}</Link></>}
      </nav>

      <div className="mt-8 grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-7"><Gallery images={p.images} name={p.name} /></div>

        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            {p.category && <p className="eyebrow">{p.category.name}</p>}
            <h1 className="display h-lg mt-3">{p.name}</h1>
            <p className="mt-5 text-lg">
              {formatMoney(p.unit_price)} <span className="text-ink-soft">per {unitLabel[p.pricing_unit]}</span>
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {p.total_quantity} in inventory
              {Number(p.security_deposit) > 0 && <> · {formatMoney(p.security_deposit)} refundable deposit per item</>}
            </p>
            <div className="mt-10">
              <AvailabilityPanel product={p} timeZone={settings.timezone} whatsappUrl={wa.url} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-24 grid gap-14 border-t border-line pt-14 lg:grid-cols-12 lg:gap-16">
        <section className="lg:col-span-7" aria-labelledby="d">
          <h2 id="d" className="eyebrow">About this piece</h2>
          <p className="display mt-5 max-w-2xl text-3xl leading-snug">{p.description}</p>
          {p.rental_conditions && (
            <>
              <h2 className="eyebrow mt-14">Rental conditions</h2>
              <p className="mt-4 max-w-xl text-ink-soft">{p.rental_conditions}</p>
            </>
          )}
          {settings.cancellation_policy && (
            <>
              <h2 className="eyebrow mt-10">Cancellation</h2>
              <p className="mt-4 max-w-xl text-ink-soft">{settings.cancellation_policy}</p>
            </>
          )}
        </section>
        {specs.length > 0 && (
          <section className="lg:col-span-5" aria-labelledby="s">
            <h2 id="s" className="eyebrow">Specifications</h2>
            <dl className="mt-5 divide-y divide-line border-y border-line">
              {specs.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[8rem_1fr] gap-4 py-3 text-sm">
                  <dt className="text-ink-soft">{k}</dt><dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </article>
  );
}
