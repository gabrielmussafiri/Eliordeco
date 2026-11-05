import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { FAQ, INCLUDED, SERVICE_AREA, STEPS } from "@/lib/content";

export const metadata: Metadata = {
  title: "How It Works",
  description: `Request a quote in a few steps. ${INCLUDED} across ${SERVICE_AREA}.`,
};

export default function HowItWorks() {
  return (
    <div className="shell pb-32 pt-16 md:pt-24">
      <header className="grid gap-6 md:grid-cols-12">
        <div className="md:col-span-8">
          <p className="eyebrow rise">How it works</p>
          <h1 className="display h-xl rise rise-2 mt-5">Effortless, <em>start to finish</em></h1>
        </div>
        <p className="lede rise rise-3 md:col-span-4 md:self-end">{INCLUDED}. Now booking {SERVICE_AREA}.</p>
      </header>

      <ol className="mt-20 border-t border-espresso">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="grid gap-4 border-b border-line py-10 md:grid-cols-12 md:gap-10">
            <span aria-hidden className="display text-6xl italic text-olive md:col-span-2 md:text-7xl">{i + 1}</span>
            <h2 className="display h-md md:col-span-4">{title}</h2>
            <p className="max-w-lg text-ink-soft md:col-span-6">{text}</p>
          </li>
        ))}
      </ol>

      <section aria-labelledby="faq" className="mt-28 grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="eyebrow">Good to know</p>
          <h2 id="faq" className="display h-lg mt-4">Questions, answered</h2>
        </div>
        <dl className="divide-y divide-line border-y border-line lg:col-span-7 lg:col-start-6">
          {FAQ.map(([q, a]) => (
            <div key={q} className="py-6">
              <dt className="display h-sm">{q}</dt>
              <dd className="mt-2 max-w-xl text-ink-soft">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-24 flex flex-wrap items-center gap-8">
        <ButtonLink href="/book" arrow>Request your quote</ButtonLink>
        <ButtonLink href="/rentals" variant="quiet">Explore the collection</ButtonLink>
      </div>
    </div>
  );
}
