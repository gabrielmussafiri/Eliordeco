import Link from "next/link";
import type { ReactNode } from "react";
import { bookingStatusLabel } from "@/lib/booking";

export function PageHeader({ eyebrow, title, actions }: { eyebrow?: string; title: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-espresso pb-6">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display mt-2 text-4xl md:text-5xl">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

const tone: Record<string, string> = {
  pending_review: "bg-taupe", confirmed: "bg-olive", active: "bg-espresso", completed: "bg-line border border-taupe",
  rejected: "bg-danger", cancelled: "bg-danger", expired: "bg-taupe",
  unpaid: "bg-line border border-taupe", submitted: "bg-taupe", partially_paid: "bg-olive", verified: "bg-success",
  refunded: "bg-taupe",
};
const payLabels: Record<string, string> = {
  unpaid: "Unpaid", submitted: "Payment submitted", partially_paid: "Partially paid", verified: "Verified",
  rejected: "Rejected", refunded: "Refunded",
};

/** Pastille + texte : le statut n'est jamais communiqué par la couleur seule. */
export function Status({ value, kind = "booking" }: { value: string; kind?: "booking" | "payment" }) {
  const label = kind === "booking" ? (bookingStatusLabel[value] ?? value) : (payLabels[value] ?? value);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[0.78rem]">
      <span aria-hidden className={`h-2 w-2 rounded-full ${kind === "payment" && value === "rejected" ? "bg-danger" : (tone[value] ?? "bg-taupe")}`} />
      {label}
    </span>
  );
}

export function Panel({ title, children, actions, id }: { title?: string; children: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="border border-line bg-white/50 p-6">
      {(title || actions) && (
        <div className="mb-5 flex items-center justify-between gap-4">
          {title && <h2 id={id} className="eyebrow">{title}</h2>}{actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, href, hint }: { label: string; value: ReactNode; href?: string; hint?: string }) {
  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <p className="display mt-2 text-5xl tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </>
  );
  return href ? <Link href={href} className="block p-6 transition-colors hover:bg-cream/70">{body}</Link> : <div className="p-6">{body}</div>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return <div role="status" aria-label={label} className="mt-8 h-64 animate-pulse bg-cream" />;
}
export function ErrorNote({ message = "We couldn't load this.", retry }: { message?: string; retry?: () => void }) {
  return (
    <p role="alert" className="mt-8 border-l-2 border-danger pl-4 text-sm text-danger">
      {message} {retry && <button onClick={retry} className="underline underline-offset-2">Try again</button>}
    </p>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-ink-soft">{children}</p>;
}

export const inputCls =
  "w-full border-0 border-b border-taupe bg-transparent py-3 text-base focus:border-espresso focus:outline-none sm:py-2 sm:text-sm";
export const selectCls = inputCls;
