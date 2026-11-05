import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProductCard } from "@/components/catalog/ProductCard";
import { getCategories, getProducts } from "@/lib/api";

export const metadata: Metadata = {
  title: "Collection",
  description: "Outdoor umbrellas, tables, chairs and event decor to rent.",
};

const SORTS = [["name", "Name"], ["price_asc", "Price ↑"], ["price_desc", "Price ↓"]] as const;

export default function RentalsPage({ searchParams }: PageProps<"/rentals">) {
  return (
    <div className="shell pb-32 pt-16 md:pt-24">
      <header className="grid gap-6 md:grid-cols-12">
        <div className="md:col-span-8">
          <p className="eyebrow rise">The collection</p>
          <h1 className="display h-xl rise rise-2 mt-5">Shade for<br /><em>every gathering</em></h1>
        </div>
        <p className="lede rise rise-3 md:col-span-4 md:self-end">
          Choose what you need, then check live availability for your date.
        </p>
      </header>
      <Suspense fallback={<div className="mt-16 h-96 animate-pulse bg-cream" aria-label="Loading collection" />}>
        <Catalog searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Catalog({ searchParams }: { searchParams: PageProps<"/rentals">["searchParams"] }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const category = one(sp.category), q = one(sp.q).trim(), sort = one(sp.sort) || "name";

  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({ ...(category && { category }), ...(q && { q }), sort }),
  ]);

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ...(category && { category }), ...(q && { q }), ...(sort !== "name" && { sort }), ...over });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    const s = p.toString();
    return "/rentals" + (s ? `?${s}` : "");
  };

  return (
    <>
      <div className="mt-14 flex flex-col gap-8 border-y border-line py-6 lg:flex-row lg:items-center lg:justify-between">
        {(categories.length > 1 || category) && <nav aria-label="Categories" className="-mx-1 flex flex-wrap gap-x-7 gap-y-3 text-[0.8rem] font-medium uppercase tracking-[0.14em]">
          <Link href={href({ category: "" })} aria-current={!category ? "page" : undefined} className="link-draw">All</Link>
          {categories.map((c) => (
            <Link key={c.id} href={href({ category: c.slug })} aria-current={category === c.slug ? "page" : undefined} className="link-draw">
              {c.name}
            </Link>
          ))}
        </nav>}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          {(products.length > 1 || q) && <form action="/rentals" role="search" className="flex items-center gap-3 border-b border-taupe">
            {category && <input type="hidden" name="category" value={category} />}
            {sort !== "name" && <input type="hidden" name="sort" value={sort} />}
            <label htmlFor="q" className="sr-only">Search by product name</label>
            <input id="q" name="q" defaultValue={q} placeholder="Search by name" className="w-48 bg-transparent py-2 focus:outline-none" />
            <button className="text-[0.75rem] font-semibold uppercase tracking-[0.14em]">Search</button>
          </form>}
          {products.length > 1 && <div className="flex items-center gap-4 text-sm">
            <span className="eyebrow">Sort</span>
            {SORTS.map(([v, l]) => (
              <Link key={v} href={href({ sort: v === "name" ? "" : v })} aria-current={sort === v ? "true" : undefined}
                className="link-draw aria-[current=true]:font-semibold">{l}</Link>
            ))}
          </div>}
        </div>
      </div>

      {products.length === 0 ? (
        <div className="mt-24 max-w-md">
          <p className="display h-md">Nothing matches that yet.</p>
          <p className="mt-4 text-ink-soft">
            {q ? `We couldn't find “${q}”${category ? " in this category" : ""}.` : "This category is empty right now."}{" "}
            Try another search, or <Link href="/rentals" className="underline underline-offset-4">see the full collection</Link>.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-ink-soft" aria-live="polite">{products.length} piece{products.length === 1 ? "" : "s"}</p>
          <ul className="mt-10 grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-12">
            {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} solo={products.length === 1} />)}
          </ul>
        </>
      )}
    </>
  );
}
