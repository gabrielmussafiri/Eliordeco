import Link from "next/link";
import { Suspense } from "react";
import { ProductCard } from "@/components/catalog/ProductCard";
import { ButtonLink } from "@/components/ui/Button";
import { Photo } from "@/components/ui/Photo";
import { BRAND_NAME, BRAND_STATEMENT, INCLUDED, SERVICE_AREA, STEPS } from "@/lib/content";
import { HERO_IMAGE, formatMoney, getCategories, getProducts, getPublicSettings, unitLabel, waLink,
  type Category, type Product } from "@/lib/api";

export default function Home() {
  return (
    <>
      <Hero />
      <Suspense fallback={<div className="shell mt-32 h-[36rem] animate-pulse bg-cream" aria-label="Loading collections" />}>
        <Collections />
      </Suspense>
      <HowItWorks />
      <About />
      <BookingCta />
      <Suspense fallback={null}>
        <Contact />
      </Suspense>
    </>
  );
}

/* ───────── 1. Ouverture éditoriale ───────── */
function Hero() {
  return (
    <section className="shell grid items-end gap-10 pb-8 pt-10 md:pt-16 lg:grid-cols-12 lg:gap-6">
      <div className="relative z-10 lg:col-span-6 lg:pb-16">
        <p className="eyebrow rise">Luxury outdoor umbrella rentals</p>
        <h1 className="display h-xl rise rise-2 mt-6">
          Make every <em className="text-olive-deep">gathering</em> feel special.
        </h1>
        <p className="lede rise rise-3 mt-8">
          Thoughtfully selected outdoor essentials and event decor to help bring your celebrations to life.
        </p>
        <div className="rise rise-3 mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
          <ButtonLink href="/book" arrow>Book now</ButtonLink>
          <ButtonLink href="/rentals" variant="quiet">Explore the collection</ButtonLink>
        </div>
        <p className="rise rise-3 mt-10 border-t border-line pt-5 text-sm text-ink-soft">
          {INCLUDED} · Now booking {SERVICE_AREA}
        </p>
      </div>
      <div className="relative lg:col-span-6">
        <div className="frame rise rise-2 relative aspect-[4/5] lg:ml-auto lg:w-[92%]">
          <Photo src={HERO_IMAGE} alt="Fringed white umbrellas over a long table set for a garden party" priority sizes="(min-width:1024px) 45vw, 100vw" />
        </div>
        <p className="mt-3 text-xs uppercase tracking-[0.16em] text-ink-soft lg:text-right">Fringed umbrellas, long tables, a garden party</p>
      </div>
    </section>
  );
}

/* ───────── 2 & 3. Collections + pièces à la une ───────── */
async function Collections() {
  const [categories, products] = await Promise.all([getCategories(), getProducts()]);
  const withItems = categories
    .map((c) => ({ c, items: products.filter((p) => p.category?.id === c.id) }))
    .filter((x) => x.items.length);
  const lead = withItems.slice(0, 3);
  const rest = withItems.slice(3);
  // Une pièce à la une par catégorie différente, pour varier le propos
  const featured: Product[] = withItems.length > 1 ? withItems.map((x) => x.items[0]).slice(0, 4) : products.slice(0, 4);

  return (
    <>
      {withItems.length > 1 && (
      <section className="shell mt-20 md:mt-40" aria-labelledby="col-h">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Selected collections</p>
            <h2 id="col-h" className="display h-lg mt-4">Start with the <em>setting</em></h2>
          </div>
          <Link href="/rentals" className="link-draw hidden text-[0.8rem] font-medium uppercase tracking-[0.14em] sm:block">All pieces</Link>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-12">
          {lead.map(({ c, items }, i) => (
            <CollectionTile key={c.id} category={c} product={items[0]} count={items.length}
              className={["md:col-span-7 md:row-span-2", "md:col-span-5", "md:col-span-5"][i]}
              ratio={["aspect-[4/5] md:aspect-auto md:h-full md:min-h-[38rem]", "aspect-[5/4]", "aspect-[5/4]"][i]} />
          ))}
        </div>
        {rest.length > 0 && (
          <p className="mt-8 text-sm text-ink-soft">
            Also: {rest.map(({ c }, i) => (
              <span key={c.id}>{i > 0 && " · "}<Link href={`/rentals?category=${c.slug}`} className="link-draw text-espresso">{c.name}</Link></span>
            ))}
          </p>
        )}
      </section>
      )}

      <section className="shell mt-20 md:mt-40" aria-labelledby="feat-h">
        {featured.length === 1 ? <SingleFeature product={featured[0]} /> : (
          <>
            <p className="eyebrow">Featured equipment</p>
            <h2 id="feat-h" className="display h-lg mt-4 max-w-2xl">A few pieces to <em>begin with</em></h2>
            <ul className="mt-14 grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-12">
              {featured.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

/** Mise en page éditoriale quand le catalogue ne compte qu'un produit. */
function SingleFeature({ product: p }: { product: Product }) {
  const img = p.images[0];
  return (
    <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-20">
      <Link href={`/rentals/${p.slug}`} className="group lg:col-span-7">
        <div className="frame relative aspect-[5/4]">
          {img && <Photo src={img.url} alt={img.alt || p.name} sizes="(min-width:1024px) 55vw, 100vw" className="origin-[30%_85%] scale-[1.5] object-[40%_70%]" />}
        </div>
      </Link>
      <div className="lg:col-span-5">
        <p className="eyebrow">Now renting</p>
        <h2 id="feat-h" className="display h-lg mt-4">{p.name}</h2>
        <p className="mt-6 max-w-md text-ink-soft">{p.description}</p>
        <p className="mt-6 text-lg">{formatMoney(p.unit_price)} <span className="text-ink-soft">per {unitLabel[p.pricing_unit]}</span></p>
        <p className="mt-1 text-sm text-ink-soft">{INCLUDED}</p>
        <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
          <ButtonLink href={`/rentals/${p.slug}`} arrow>Check availability</ButtonLink>
          <ButtonLink href="/rentals" variant="quiet">View the collection</ButtonLink>
        </div>
      </div>
    </div>
  );
}

function CollectionTile({ category, product, count, className, ratio }:
  { category: Category; product: Product; count: number; className: string; ratio: string }) {
  const img = product.images[0];
  return (
    <Link href={`/rentals?category=${category.slug}`} className={`group relative block ${className}`}>
      <div className={`frame relative ${ratio}`}>
        {img && <Photo src={img.url} alt="" sizes="(min-width:768px) 55vw, 100vw" />}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-espresso/55 to-transparent p-6 pt-24 text-ivory">
          <p className="text-xs uppercase tracking-[0.18em]">{count} piece{count === 1 ? "" : "s"}</p>
          <h3 className="display mt-1 text-4xl">{category.name}</h3>
        </div>
      </div>
    </Link>
  );
}

/* ───────── 4. Comment ça marche ───────── */
function HowItWorks() {
  return (
    <section className="mt-20 bg-cream py-20 md:mt-40 md:py-32" aria-labelledby="how-h">
      <div className="shell grid gap-14 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-32">
            <p className="eyebrow">How renting works</p>
            <h2 id="how-h" className="display h-lg mt-4">Effortless, from first look to <em>pick-up</em></h2>
            <p className="lede mt-6">Questions at any step? Message us on WhatsApp and we&rsquo;ll answer.</p>
            <ButtonLink href="/how-it-works" variant="quiet" className="mt-6">Read the details</ButtonLink>
          </div>
        </div>
        <ol className="lg:col-span-7 lg:col-start-6">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="grid grid-cols-[4.5rem_1fr] gap-4 border-t border-taupe/60 py-9 md:grid-cols-[7rem_1fr]">
              <span aria-hidden className="display text-6xl italic text-olive md:text-7xl">{i + 1}</span>
              <div>
                <h3 className="display h-md">{title}</h3>
                <p className="mt-3 max-w-md text-ink-soft">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────── 5. À propos ───────── */
function About() {
  return (
    <section className="shell mt-20 grid gap-8 border-t border-espresso pt-12 md:mt-40 lg:grid-cols-12 lg:gap-20" aria-labelledby="about-h">
      <div className="lg:col-span-5">
        <p className="eyebrow">About {BRAND_NAME}</p>
        <h2 id="about-h" className="display h-lg mt-4">Shade that makes the day feel <em>elevated</em></h2>
      </div>
      <div className="lg:col-span-6 lg:col-start-7">
        <div className="space-y-5 text-ink-soft">
          <p>{BRAND_STATEMENT}</p>
          <p>Perfect for baby showers, birthdays, brunches, backyard events and outdoor celebrations — now booking {SERVICE_AREA}.</p>
        </div>
        <ButtonLink href="/about" variant="quiet" className="mt-8">Our story</ButtonLink>
      </div>
    </section>
  );
}

/* ───────── 6. Appel à réserver ───────── */
function BookingCta() {
  return (
    <section className="mt-20 bg-olive-deep text-ivory md:mt-40" aria-labelledby="cta-h">
      <div className="shell grid items-end gap-10 py-20 md:py-28 lg:grid-cols-12">
        <h2 id="cta-h" className="display h-xl lg:col-span-8">Planning something? <em>Let&rsquo;s set the date.</em></h2>
        <div className="lg:col-span-4 lg:justify-self-end">
          <p className="mb-8 max-w-xs text-cream/85">Request your quote in a few steps. No payment is taken online — we confirm first.</p>
          <ButtonLink href="/book" arrow className="!bg-ivory !text-espresso hover:!bg-cream">Start a booking</ButtonLink>
        </div>
      </div>
    </section>
  );
}

/* ───────── 7. Contact & WhatsApp ───────── */
async function Contact() {
  const s = await getPublicSettings();
  const wa = waLink(s.whatsapp_number, `Hello! I have a question about renting from ${BRAND_NAME}.`);
  return (
    <section id="contact" className="shell py-24 md:py-32" aria-labelledby="contact-h">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="eyebrow">Contact</p>
          <h2 id="contact-h" className="display h-lg mt-4">Say hello</h2>
        </div>
        <dl className="grid gap-10 sm:grid-cols-2 lg:col-span-7">
          {wa && (
            <div>
              <dt className="eyebrow">WhatsApp — fastest</dt>
              <dd className="mt-3"><a href={wa} target="_blank" rel="noopener noreferrer" className="display link-draw text-3xl">Message us</a></dd>
            </div>
          )}
          {s.contact_email && (
            <div>
              <dt className="eyebrow">Email</dt>
              <dd className="mt-3"><a href={`mailto:${s.contact_email}`} className="link-draw break-all text-lg">{s.contact_email}</a></dd>
            </div>
          )}
          {s.business_address && (
            <div className="sm:col-span-2">
              <dt className="eyebrow">Area</dt>
              <dd className="mt-3 text-ink-soft">{s.business_address}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
