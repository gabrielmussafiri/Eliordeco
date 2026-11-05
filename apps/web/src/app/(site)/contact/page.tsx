import type { Metadata } from "next";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { getPublicSettings, waLink } from "@/lib/api";
import { INCLUDED, SERVICE_AREA } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact",
  description: `Request your quote or send us a message. Now booking ${SERVICE_AREA}.`,
};

export default function Contact() {
  return (
    <div className="shell pb-32 pt-16 md:pt-24">
      <header className="grid gap-6 md:grid-cols-12">
        <div className="md:col-span-8">
          <p className="eyebrow rise">Contact</p>
          <h1 className="display h-xl rise rise-2 mt-5">Let&rsquo;s plan <em>your day</em></h1>
        </div>
        <p className="lede rise rise-3 md:col-span-4 md:self-end">Request your quote online or send us a message — whichever is easiest.</p>
      </header>
      <div className="mt-16 grid gap-12 lg:grid-cols-12">
        <div className="border-t border-espresso pt-8 lg:col-span-5">
          <h2 className="eyebrow">Request a quote</h2>
          <p className="display h-md mt-4">Tell us what, where and when.</p>
          <p className="mt-4 max-w-sm text-ink-soft">{INCLUDED}. Now booking {SERVICE_AREA}.</p>
          <ButtonLink href="/book" arrow className="mt-8">Start a booking</ButtonLink>
        </div>
        <Suspense fallback={<div className="h-64 animate-pulse bg-cream lg:col-span-7" aria-label="Loading contact details" />}>
          <Details />
        </Suspense>
      </div>
    </div>
  );
}

async function Details() {
  const s = await getPublicSettings();
  const wa = waLink(s.whatsapp_number, "Hello! I'd like a quote for an outdoor event.");
  const hours = Object.entries(s.operating_hours ?? {});
  return (
    <dl className="grid gap-10 border-t border-espresso pt-8 sm:grid-cols-2 lg:col-span-7">
      {wa && (
        <div>
          <dt className="eyebrow">WhatsApp — fastest</dt>
          <dd className="mt-3"><a href={wa} target="_blank" rel="noopener noreferrer" className="display link-draw text-3xl">Message us</a></dd>
        </div>
      )}
      {s.contact_email && (
        <div>
          <dt className="eyebrow">Email</dt>
          <dd className="mt-3"><a href={`mailto:${s.contact_email}`} className="link-draw break-all text-lg">{s.contact_email}</a></dd>
        </div>
      )}
      <div>
        <dt className="eyebrow">Service area</dt>
        <dd className="mt-3 text-ink-soft">{s.business_address || SERVICE_AREA}</dd>
      </div>
      {hours.length > 0 && (
        <div>
          <dt className="eyebrow">Hours</dt>
          <dd className="mt-3 space-y-1 text-sm text-ink-soft">
            {hours.map(([d, h]) => <p key={d} className="flex justify-between gap-6"><span>{d}</span><span>{h}</span></p>)}
          </dd>
        </div>
      )}
    </dl>
  );
}
