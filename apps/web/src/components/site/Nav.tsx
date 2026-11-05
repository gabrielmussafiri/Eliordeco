"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/ui/Wordmark";
import { ButtonLink } from "@/components/ui/Button";

const links = [
  { href: "/", label: "Home" },
  { href: "/rentals", label: "Collection" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Nav() {
  const pathname = usePathname();
  // Le menu est « ouvert pour cette page » : changer de page le referme sans effet de bord.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) =>
    setOpenAt((cur) => ((typeof v === "function" ? v(cur === pathname) : v) ? pathname : null));

  // Échap ferme ; défilement verrouillé tant que le menu est ouvert
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenAt(null);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  const current = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-line bg-ivory/92 backdrop-blur-sm">
      <div className="shell flex h-[4.5rem] items-center justify-between">
        <Wordmark />
        <nav aria-label="Primary" className="hidden items-center gap-10 lg:flex">
          {links.slice(1).map((l) => (
            <Link key={l.href} href={l.href} aria-current={current(l.href) ? "page" : undefined}
              className="link-draw py-1 text-[0.8rem] font-medium uppercase tracking-[0.14em]">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <ButtonLink href="/book" arrow className="max-sm:hidden min-h-11">Book Now</ButtonLink>
          <button type="button" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((v) => !v)}
            className="flex h-11 items-center gap-3 text-[0.75rem] font-semibold uppercase tracking-[0.16em] lg:hidden">
            {open ? "Close" : "Menu"}
            <span aria-hidden className="relative block h-3 w-6">
              <span className={`absolute left-0 h-px w-6 bg-espresso transition-all duration-300 ${open ? "top-1.5 rotate-45" : "top-0"}`} />
              <span className={`absolute left-0 h-px w-6 bg-espresso transition-all duration-300 ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
            </span>
          </button>
        </div>
      </div>

    </header>

      {/* Menu mobile plein écran. Placé hors de l'en-tête : son backdrop-filter piégerait ce panneau en position fixe. */}
      <div id="mobile-menu" hidden={!open}
        className="fixed inset-x-0 top-[4.5rem] bottom-0 z-30 flex flex-col justify-between overflow-y-auto bg-ivory px-[var(--gutter)] pb-8 pt-10 lg:hidden">
        <nav aria-label="Mobile">
          <ul>
            {links.map((l, i) => (
              <li key={l.href} className="border-b border-line">
                <Link href={l.href} aria-current={current(l.href) ? "page" : undefined}
                  className="display flex items-baseline justify-between py-5 text-5xl aria-[current=page]:italic">
                  {l.label}
                  <span className="text-xs font-sans not-italic tracking-[0.2em] text-taupe">0{i + 1}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-10 space-y-5">
          <ButtonLink href="/book" arrow className="w-full">Book Now</ButtonLink>
          <p className="text-sm text-ink-soft">Questions? Message us on WhatsApp from the Contact page.</p>
        </div>
      </div>
    </>
  );
}
