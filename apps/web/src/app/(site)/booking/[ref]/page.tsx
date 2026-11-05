import type { Metadata } from "next";
import { Suspense } from "react";
import { Portal } from "@/components/booking/Portal";

export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

export default function BookingPage({ params }: PageProps<"/booking/[ref]">) {
  return (
    <div className="shell pb-32 pt-12 md:pt-20">
      <Suspense fallback={<div className="h-96 animate-pulse bg-cream" aria-label="Loading" />}>
        <Reference params={params} />
      </Suspense>
    </div>
  );
}

async function Reference({ params }: { params: PageProps<"/booking/[ref]">["params"] }) {
  const { ref } = await params;
  return <Portal reference={ref.toUpperCase()} />;
}
