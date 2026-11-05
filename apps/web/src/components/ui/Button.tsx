import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "outline" | "quiet" | "olive";

const base =
  "group/btn relative inline-flex items-center justify-center gap-3 whitespace-nowrap font-sans text-[0.8rem] font-semibold " +
  "uppercase tracking-[0.14em] transition-colors duration-300 disabled:opacity-45 disabled:pointer-events-none " +
  "min-h-12 px-7 rounded-sm";

const variants: Record<Variant, string> = {
  primary: "bg-espresso text-ivory hover:bg-olive-deep",
  olive: "bg-olive-deep text-white hover:bg-espresso",
  outline: "border border-espresso text-espresso hover:bg-espresso hover:text-ivory",
  quiet: "!px-0 !min-h-11 text-espresso",
};

function Arrow() {
  return (
    <svg aria-hidden width="18" height="10" viewBox="0 0 18 10" fill="none"
      className="transition-transform duration-300 group-hover/btn:translate-x-1">
      <path d="M0 5h16M12 1l4 4-4 4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

type Common = { variant?: Variant; arrow?: boolean; children: ReactNode; className?: string };

export function Button({ variant = "primary", arrow, className = "", children, ...rest }:
  Common & Omit<ComponentProps<"button">, keyof Common>) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {variant === "quiet" ? <span className="link-draw py-1">{children}</span> : children}{arrow && <Arrow />}
    </button>
  );
}

export function ButtonLink({ variant = "primary", arrow, className = "", children, ...rest }:
  Common & Omit<ComponentProps<typeof Link>, keyof Common>) {
  return (
    <Link className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {variant === "quiet" ? <span className="link-draw py-1">{children}</span> : children}{arrow && <Arrow />}
    </Link>
  );
}
