"use client";

import { useState } from "react";
import { ErrorNote, PageHeader, Panel, inputCls, selectCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { put, useAction, useAdmin, type AdminSettings } from "@/lib/admin";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];
const BANK: [string, string][] = [["bank_name", "Bank name"], ["account_holder", "Account holder"], ["account_number", "Account number"], ["routing", "Routing number"]];

export default function SettingsPage() {
  const { settings, me, reloadSettings } = useAdmin();
  if (me.role !== "owner") return <ErrorNote message="Only the owner can change settings." />;
  return <Form s={settings} reload={reloadSettings} />;
}

function Form({ s, reload }: { s: AdminSettings; reload: () => void }) {
  const [v, setV] = useState({
    business_name: s.business_name, contact_email: s.contact_email, notification_emails: (s.notification_emails ?? []).join(", "), whatsapp_number: s.whatsapp_number, business_address: s.business_address,
    timezone: s.timezone, rental_policies: s.rental_policies, cancellation_policy: s.cancellation_policy,
    payment_instructions: s.payment_instructions, payment_methods: s.payment_methods.join(", "),
    deposit_percentage: String(s.deposit_percentage), pending_expiry_hours: String(s.pending_expiry_hours ?? 48), delivery_enabled: s.delivery_enabled, delivery_fee: String(s.delivery_fee),
    buffer_before_minutes: String(s.buffer_before_minutes), buffer_after_minutes: String(s.buffer_after_minutes),
    bank: { bank_name: "", account_holder: "", account_number: "", routing: "", ...s.bank_details }, hours: { ...s.operating_hours } as Record<string, string>,
  });
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const set = (k: string, val: unknown) => { setV({ ...v, [k]: val }); setSaved(false); };
  const text = (k: keyof typeof v, label: string, extra: object = {}) => (
    <div><label htmlFor={k} className="eyebrow block">{label}</label>
      <input id={k} value={v[k] as string} onChange={(e) => set(k, e.target.value)} className={inputCls} {...extra} /></div>
  );

  const save = () => run(async () => {
    await put("/api/admin/settings", {
      business_name: v.business_name, contact_email: v.contact_email,
      notification_emails: v.notification_emails.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean), whatsapp_number: v.whatsapp_number.replace(/[^\d]/g, ""),
      business_address: v.business_address, timezone: v.timezone, rental_policies: v.rental_policies, cancellation_policy: v.cancellation_policy,
      payment_instructions: v.payment_instructions, payment_methods: v.payment_methods.split(",").map((x) => x.trim()).filter(Boolean),
      deposit_percentage: Number(v.deposit_percentage), pending_expiry_hours: Number(v.pending_expiry_hours), delivery_enabled: v.delivery_enabled, delivery_fee: v.delivery_fee || "0",
      buffer_before_minutes: Number(v.buffer_before_minutes), buffer_after_minutes: Number(v.buffer_after_minutes),
      bank_details: v.bank, operating_hours: Object.fromEntries(Object.entries(v.hours).filter(([, x]) => x.trim())), currency: "USD",
    });
    reload(); setSaved(true);
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="max-w-4xl space-y-8">
      <PageHeader eyebrow="Owner only" title="Business settings" />
      <Panel title="Business" id="b"><div className="grid gap-6 sm:grid-cols-2">
        {text("business_name", "Business name")}{text("contact_email", "Contact email", { type: "email" })}
        <div className="sm:col-span-2">{text("notification_emails", "Send booking and payment alerts to (up to 5 emails, separated by commas)", { placeholder: "you@gmail.com, partner@gmail.com" })}
          <p className="mt-2 text-xs text-ink-soft">Private: never shown on the website. If empty, alerts go to the contact email above. Alerts are only sent once email sending is set up.</p></div>
        {text("whatsapp_number", "WhatsApp number", { inputMode: "tel", placeholder: "15551234567" })}
        <div><label htmlFor="tz" className="eyebrow block">Timezone</label>
          <select id="tz" value={v.timezone} onChange={(e) => set("timezone", e.target.value)} className={selectCls}>{[...new Set([v.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}</select></div>
        <div className="sm:col-span-2">{text("business_address", "Business address / service area")}</div>
        <p className="text-xs text-ink-soft sm:col-span-2">WhatsApp links use this number in international format without “+” (e.g. 15551234567). Currency: USD.</p>
      </div></Panel>
      <Panel title="Operating hours" id="h"><div className="grid gap-4 sm:grid-cols-2">
        {DAYS.map((d) => (<div key={d}><label htmlFor={`h-${d}`} className="eyebrow block">{d}</label>
          <input id={`h-${d}`} value={v.hours[d] ?? ""} placeholder="9:00 AM – 6:00 PM, or leave empty if closed" onChange={(e) => set("hours", { ...v.hours, [d]: e.target.value })} className={inputCls} /></div>))}
      </div></Panel>
      <Panel title="Payments" id="p"><div className="grid gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2"><label htmlFor="pi" className="eyebrow block">Payment instructions shown to customers</label>
          <textarea id="pi" rows={3} value={v.payment_instructions} onChange={(e) => set("payment_instructions", e.target.value)} className={`${inputCls} border border-taupe p-3`} /></div>
        {text("payment_methods", "Accepted methods (comma separated)")}{text("deposit_percentage", "Default deposit %", { inputMode: "numeric" })}
        {BANK.map(([k, l]) => (<div key={k}><label htmlFor={`bk-${k}`} className="eyebrow block">{l}</label>
          <input id={`bk-${k}`} value={v.bank[k as keyof typeof v.bank]} onChange={(e) => set("bank", { ...v.bank, [k]: e.target.value })} className={inputCls} autoComplete="off" /></div>))}
        <p className="text-xs text-ink-soft sm:col-span-2">Bank details are only shown to a customer who holds a booking&rsquo;s private link — never on public pages.</p>
      </div></Panel>
      <Panel title="Delivery & availability" id="d"><div className="grid gap-6 sm:grid-cols-2">
        <label className="flex items-center gap-3 text-sm sm:col-span-2"><input type="checkbox" checked={v.delivery_enabled} onChange={(e) => set("delivery_enabled", e.target.checked)} className="h-4 w-4 accent-olive-deep" /> Offer delivery</label>
        {text("delivery_fee", "Delivery charge (USD)", { inputMode: "decimal" })}<div />
        {text("pending_expiry_hours", "Unreviewed requests expire after (hours)", { inputMode: "numeric" })}
        <p className="self-end pb-3 text-xs text-ink-soft">They stop holding stock then. A request with a payment attached never expires on its own.</p>
        {text("buffer_before_minutes", "Default preparation buffer (min)", { inputMode: "numeric" })}
        {text("buffer_after_minutes", "Default return buffer (min)", { inputMode: "numeric" })}
      </div></Panel>
      <Panel title="Policies" id="pol"><div className="grid gap-6">
        <div><label htmlFor="rp" className="eyebrow block">Rental policy</label><textarea id="rp" rows={3} value={v.rental_policies} onChange={(e) => set("rental_policies", e.target.value)} className={`${inputCls} border border-taupe p-3`} /></div>
        <div><label htmlFor="cp" className="eyebrow block">Cancellation policy</label><textarea id="cp" rows={3} value={v.cancellation_policy} onChange={(e) => set("cancellation_policy", e.target.value)} className={`${inputCls} border border-taupe p-3`} /></div>
      </div></Panel>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-5"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button>{saved && <span role="status" className="text-success">Settings saved.</span>}</div>
    </form>
  );
}
