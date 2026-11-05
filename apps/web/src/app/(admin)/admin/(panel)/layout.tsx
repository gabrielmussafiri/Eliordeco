import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: { default: "Studio", template: "%s · Studio" }, robots: { index: false, follow: false } };

export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  return <Suspense fallback={<div className="shell py-20"><div className="h-64 animate-pulse bg-cream" aria-label="Loading" /></div>}><AdminShell>{children}</AdminShell></Suspense>;
}
