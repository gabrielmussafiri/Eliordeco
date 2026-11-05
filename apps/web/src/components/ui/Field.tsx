import type { ComponentProps, ReactNode } from "react";

const control =
  "w-full bg-transparent border-0 border-b border-taupe py-3 text-base text-espresso placeholder:text-taupe " +
  "transition-colors focus:border-espresso focus:outline-none focus-visible:outline-none aria-[invalid=true]:border-danger";

/** Champ à filet inférieur : label toujours visible, erreur annoncée aux lecteurs d'écran. */
export function Field({ label, error, hint, id, className = "", ...rest }:
  { label: string; error?: string; hint?: ReactNode; id: string } & ComponentProps<"input">) {
  return (
    <div className={className}>
      <label htmlFor={id} className="eyebrow block">{label}</label>
      <input id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={control} {...rest} />
      {hint && !error && <p id={`${id}-hint`} className="mt-2 text-sm text-ink-soft">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

export function TextArea({ label, error, id, className = "", ...rest }:
  { label: string; error?: string; id: string } & ComponentProps<"textarea">) {
  return (
    <div className={className}>
      <label htmlFor={id} className="eyebrow block">{label}</label>
      <textarea id={id} rows={3} aria-invalid={!!error} className={control + " resize-y"} {...rest} />
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
