"use client";

import { useEffect, useId, useRef, useState } from "react";
import { addDays, addMonths, firstOfMonth, formatDay, weekday } from "@/lib/time";

interface Props {
  id: string;
  label: string;
  value: string;                 // AAAA-MM-JJ ou ""
  onChange: (v: string) => void;
  min: string;                   // premier jour sélectionnable
  full?: Set<string>;            // jours complets (grisés, non sélectionnables)
  onViewMonth?: (monthFirst: string) => void;
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Sélecteur de dates accessible : les jours complets sont barrés, annoncés « fully booked » et non cliquables. */
export function DatePicker({ id, label, value, onChange, min, full = new Set(), onViewMonth }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(firstOfMonth(value || min));
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const dlg = useId();

  useEffect(() => { if (open) onViewMonth?.(view); }, [open, view, onViewMonth]);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, [open]);

  const start = addDays(view, -weekday(view));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const blocked = (d: string) => d < min || full.has(d);
  const focusDay = (d: string) => requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-day="${d}"]`)?.focus());
  const anchor = value && !blocked(value) ? value : cells.find((d) => d.slice(0, 7) === view.slice(0, 7) && !blocked(d));

  function key(e: React.KeyboardEvent, d: string) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (e.key === "Escape") { setOpen(false); (root.current?.querySelector("button") as HTMLButtonElement)?.focus(); return; }
    if (!step) return;
    e.preventDefault();
    const next = addDays(d, step);
    if (next.slice(0, 7) !== view.slice(0, 7)) setView(firstOfMonth(next));
    focusDay(next);
  }

  return (
    <div ref={root} className="relative">
      <label htmlFor={id} className="eyebrow block">{label}</label>
      <button id={id} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dlg : undefined}
        onClick={() => { setView(firstOfMonth(value || min)); setOpen((o) => !o); }}
        className="flex w-full items-center justify-between border-0 border-b border-taupe py-3 text-left text-base focus:border-espresso focus:outline-none">
        <span className={value ? "" : "text-taupe"}>{value ? formatDay(value, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "Select a date"}</span>
        <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3" width="13" height="11.5" stroke="currentColor"/><path d="M1.5 6.5h13M5 1.5v3M11 1.5v3" stroke="currentColor"/></svg>
      </button>

      {open && (
        <div id={dlg} role="dialog" aria-label={`Choose ${label.toLowerCase()}`}
          className="absolute left-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2.5rem))] border border-espresso bg-ivory p-4 shadow-[0_18px_40px_-20px_rgba(41,37,31,0.45)]">
          <div className="flex items-center justify-between">
            <button type="button" aria-label="Previous month" onClick={() => setView(addMonths(view, -1))}
              disabled={addMonths(view, 0) <= firstOfMonth(min)} className="h-10 w-10 disabled:opacity-30">‹</button>
            <p className="display text-xl" aria-live="polite">{formatDay(view, { month: "long", year: "numeric" })}</p>
            <button type="button" aria-label="Next month" onClick={() => setView(addMonths(view, 1))} className="h-10 w-10">›</button>
          </div>
          <div ref={grid} role="grid" aria-label={formatDay(view, { month: "long", year: "numeric" })} className="mt-2 grid grid-cols-7 text-center">
            {DAYS.map((d) => <span key={d} role="columnheader" className="py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-ink-soft">{d}</span>)}
            {cells.map((d) => {
              const off = d.slice(0, 7) !== view.slice(0, 7);
              const isFull = full.has(d), isPast = d < min, sel = d === value;
              return (
                <button key={d} type="button" data-day={d} role="gridcell" disabled={isPast || isFull}
                  tabIndex={d === anchor ? 0 : -1} aria-selected={sel}
                  aria-label={`${formatDay(d, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${isFull ? ", fully booked" : ""}`}
                  onKeyDown={(e) => key(e, d)} onClick={() => { onChange(d); setOpen(false); }}
                  className={`mx-auto flex h-10 w-10 items-center justify-center text-sm tabular-nums transition-colors
                    ${sel ? "bg-espresso text-ivory" : off ? "text-taupe" : "hover:bg-cream"}
                    ${isFull ? "text-taupe line-through decoration-taupe" : ""} ${isPast ? "opacity-30" : ""} disabled:cursor-not-allowed`}>
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>
          <p className="mt-3 border-t border-line pt-3 text-xs text-ink-soft"><span className="line-through">12</span> Struck-through dates are fully booked.</p>
        </div>
      )}
    </div>
  );
}
