import type { Metadata } from "next";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, TextArea } from "@/components/ui/Field";

export const metadata: Metadata = { title: "Design system", robots: { index: false } };

const swatches = [
  ["Ivory", "bg-ivory", "#F8F6F1"], ["Cream", "bg-cream", "#EEEAE1"], ["Espresso", "bg-espresso", "#29251F"],
  ["Ink soft", "bg-ink-soft", "#6A6154"], ["Taupe", "bg-taupe", "#A69A89"], ["Olive", "bg-olive", "#737A61"],
  ["Olive deep", "bg-olive-deep", "#555C45"], ["Line", "bg-line", "#DDD6C8"],
];

export default function DesignPage() {
  return (
    <div className="shell space-y-24 py-20">
      <header>
        <p className="eyebrow">Internal reference</p>
        <h1 className="display h-lg mt-4">Design system</h1>
        <p className="lede mt-6">Tokens and primitives shared by the storefront and the admin area.</p>
      </header>

      <section aria-labelledby="c">
        <h2 id="c" className="eyebrow mb-6">Colour</h2>
        <ul className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
          {swatches.map(([n, cls, hex]) => (
            <li key={n} className="bg-ivory">
              <div className={`${cls} h-24`} />
              <p className="px-3 py-2 text-sm"><span className="font-semibold">{n}</span> <span className="text-ink-soft">{hex}</span></p>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-xl text-sm text-ink-soft">
          Taupe stays decorative (rules, numerals): it is below AA contrast for text. Body copy uses Espresso and Ink soft.
        </p>
      </section>

      <section aria-labelledby="t" className="grid gap-10 md:grid-cols-12">
        <h2 id="t" className="eyebrow md:col-span-12">Typography</h2>
        <div className="space-y-6 md:col-span-8">
          <p className="display h-xl">Cormorant</p>
          <p className="display h-lg italic">Display, italic for emphasis</p>
          <p className="display h-md">Section heading &mdash; calm, generous</p>
          <p className="lede">Manrope carries the interface and body copy: clear at small sizes, quiet next to the serif.</p>
        </div>
        <p className="eyebrow md:col-span-4">Eyebrow &mdash; small caps label</p>
      </section>

      <section aria-labelledby="b" className="space-y-6">
        <h2 id="b" className="eyebrow">Buttons</h2>
        <div className="flex flex-wrap items-center gap-6">
          <ButtonLink href="/design" arrow>Book Now</ButtonLink>
          <ButtonLink href="/design" variant="olive">Confirm</ButtonLink>
          <ButtonLink href="/design" variant="outline">Ask about this item</ButtonLink>
          <ButtonLink href="/design" variant="quiet">Read more</ButtonLink>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      <section aria-labelledby="f" className="space-y-8">
        <h2 id="f" className="eyebrow">Forms</h2>
        <div className="grid max-w-3xl gap-8 sm:grid-cols-2">
          <Field id="n" label="Full name" placeholder="Ana Lee" />
          <Field id="e" label="Email" type="email" defaultValue="not-an-email" error="Enter a valid email address." />
          <Field id="p" label="Phone" hint="Include country code for WhatsApp, e.g. 1 555 123 4567" />
          <TextArea id="i" label="Instructions" className="sm:col-span-2" />
        </div>
      </section>
    </div>
  );
}
