import Link from "next/link";
import { Suspense } from "react";
import { Year } from "./Year";
import { BRAND_NAME, INCLUDED, SERVICE_AREA } from "@/lib/content";
import { Wordmark } from "@/components/ui/Wordmark";

export function Footer() {
  return (
    <footer className="bg-espresso text-ivory">
      <div className="shell grid gap-14 py-20 md:grid-cols-12">
        <div className="md:col-span-5">
          <Wordmark className="text-ivory" />
          <p className="display mt-8 max-w-sm text-3xl italic leading-tight text-cream">
            Make every gathering feel special.
          </p>
        </div>
        <nav aria-label="Footer" className="md:col-span-3 md:col-start-7">
          <h2 className="eyebrow !text-taupe">Explore</h2>
          <ul className="mt-5 space-y-3 text-sm">
            {[["/rentals", "Collection"], ["/how-it-works", "How It Works"], ["/about", "About"],
              ["/contact", "Contact"], ["/booking", "Find my booking"]].map(([h, l]) => (
              <li key={h}><Link href={h} className="link-draw">{l}</Link></li>
            ))}
          </ul>
        </nav>
        <div className="md:col-span-3">
          <h2 className="eyebrow !text-taupe">Visit</h2>
          <p className="mt-5 text-sm text-cream/80">Luxury outdoor umbrella rentals. {INCLUDED}. Now booking {SERVICE_AREA}.</p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="shell flex flex-col justify-between gap-2 py-6 text-xs text-taupe sm:flex-row">
          <p>&copy; <Suspense fallback={null}><Year /></Suspense> {BRAND_NAME}. All rights reserved.</p>
          <Link href="/admin" className="-my-3 w-fit py-3"><span className="link-draw">Staff sign in</span></Link>
        </div>
      </div>
    </footer>
  );
}
