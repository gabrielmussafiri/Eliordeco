import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { Photo } from "@/components/ui/Photo";
import { HERO_IMAGE } from "@/lib/api";
import { BRAND_STATEMENT, EVENT_TYPES, INCLUDED, SERVICE_AREA } from "@/lib/content";

export const metadata: Metadata = {
  title: "About",
  description: BRAND_STATEMENT,
};

export default function About() {
  return (
    <div className="pb-32">
      <section className="shell grid items-end gap-12 pt-16 md:pt-24 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <p className="eyebrow rise">About</p>
          <h1 className="display h-xl rise rise-2 mt-5">Shade, made <em className="text-olive-deep">elevated</em></h1>
          <p className="lede rise rise-3 mt-8">{BRAND_STATEMENT}</p>
        </div>
        <div className="frame rise rise-2 relative aspect-[5/4] lg:col-span-6">
          <Photo src={HERO_IMAGE} alt="Fringed white umbrellas over a long table in a garden" priority
            sizes="(min-width:1024px) 50vw, 100vw" className="object-[50%_70%]" />
        </div>
      </section>

      <section className="shell mt-28 grid gap-12 lg:grid-cols-12" aria-labelledby="for">
        <div className="lg:col-span-4">
          <p className="eyebrow">Perfect for</p>
          <h2 id="for" className="display h-lg mt-4">Your next gathering</h2>
        </div>
        <ul className="divide-y divide-line border-y border-line lg:col-span-7 lg:col-start-6">
          {EVENT_TYPES.map((t) => <li key={t} className="display h-md py-5">{t}</li>)}
        </ul>
      </section>

      <section className="shell mt-28 grid gap-12 border-t border-espresso pt-14 lg:grid-cols-12" aria-labelledby="inc">
        <div className="lg:col-span-4">
          <p className="eyebrow">What you get</p>
          <h2 id="inc" className="display h-lg mt-4">Nothing to carry</h2>
        </div>
        <div className="max-w-xl space-y-5 text-ink-soft lg:col-span-7 lg:col-start-6">
          <p>{INCLUDED}. We bring the umbrellas, set them up where they belong, and collect them when the celebration is over.</p>
          <p>We&rsquo;re now booking {SERVICE_AREA}.</p>
          <div className="pt-4"><ButtonLink href="/book" arrow>Request your quote</ButtonLink></div>
        </div>
      </section>
    </div>
  );
}
