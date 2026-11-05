import Link from "next/link";
import { BRAND_NAME } from "@/lib/content";

/** Logotype : « Favor Upon You » en italique, « Rentals » en petites capitales. Toujours sur une ligne. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" aria-label={`${BRAND_NAME} — home`} className={`inline-flex items-baseline gap-1.5 whitespace-nowrap py-3 sm:gap-2 ${className}`}>
      <span className="display text-[1.45rem] italic leading-none sm:text-[1.85rem]">Favor Upon You</span>
      <span className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] sm:text-[0.66rem] sm:tracking-[0.3em]">Rentals</span>
    </Link>
  );
}
