"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RecentBookings } from "@/components/booking/Portal";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api } from "@/lib/api";

export default function FindBooking() {
  const router = useRouter();
  const [ref, setRef] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [mailError, setMailError] = useState("");

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    setMailError("");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMailError("Enter the email you booked with.");
    setSending(true);
    try { await api("/api/portal/resend", { method: "POST", json: { email: email.trim() } }); setSent(true); }
    catch { setMailError("We couldn't send that right now. Please try again in a few minutes."); }
    finally { setSending(false); }
  }

  function go(e: React.FormEvent) {
    e.preventDefault();
    const r = ref.trim().toUpperCase();
    if (!/^ELD-\d{4}-\d{4}$/.test(r)) return setError("References look like ELD-2026-0001.");
    if (code.trim().length < 16) return setError("Enter the access code from your confirmation.");
    router.push(`/booking/${r}#t=${encodeURIComponent(code.trim())}`);
  }

  return (
    <div className="shell pb-32 pt-12 md:pt-20">
      <p className="eyebrow">Your booking</p>
      <h1 className="display h-lg mt-4">Find my booking</h1>
      <p className="lede mt-5">Open the link from your confirmation, or enter your reference and access code.</p>
      <form onSubmit={go} noValidate className="mt-12 grid max-w-xl gap-8">
        <Field id="f-ref" label="Booking reference" placeholder="ELD-2026-0001" value={ref} autoCapitalize="characters"
          onChange={(e) => setRef(e.target.value)} />
        <Field id="f-code" label="Access code" value={code} autoComplete="off" spellCheck={false}
          hint="It's in the link we gave you after you submitted your request." onChange={(e) => setCode(e.target.value)} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div><Button type="submit" arrow>Open booking</Button></div>
      </form>
      <RecentBookings />

      <section aria-labelledby="lost" className="mt-20 max-w-xl border-t border-line pt-10">
        <h2 id="lost" className="display h-md">Lost your link?</h2>
        <p className="mt-3 text-ink-soft">Enter the email you booked with and we&rsquo;ll send your booking links.</p>
        {sent ? (
          <p role="status" className="mt-6 border-l-2 border-olive pl-4 text-sm">
            If we have bookings under that address, the links are on their way. It can take a minute; check your spam folder too.
          </p>
        ) : (
          <form onSubmit={resend} noValidate className="mt-6 flex flex-wrap items-end gap-6">
            <Field id="f-mail" label="Email" type="email" value={email} autoComplete="email" error={mailError}
              onChange={(e) => setEmail(e.target.value)} className="min-w-64 flex-1" />
            <Button type="submit" variant="outline" disabled={sending}>{sending ? "Sending…" : "Email me my links"}</Button>
          </form>
        )}
      </section>
    </div>
  );
}
