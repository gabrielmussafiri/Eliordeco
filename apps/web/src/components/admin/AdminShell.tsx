"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense } from "react";
import { Wordmark } from "@/components/ui/Wordmark";
import { AdminCtx, post, useAdminFetch, type AdminSettings, type Me } from "@/lib/admin";
import { ErrorNote, Loading } from "./ui";

const NAV = [
  ["/admin", "Overview"], ["/admin/bookings", "Bookings"], ["/admin/payments", "Payments"],
  ["/admin/calendar", "Calendar"], ["/admin/inventory", "Inventory"], ["/admin/customers", "Customers"],
  ["/admin/settings", "Settings"], ["/admin/account", "Account"],
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const me = useAdminFetch<Me>("/api/admin/me");
  const settings = useAdminFetch<AdminSettings>("/api/admin/settings");
  const active = (h: string) => (h === "/admin" ? pathname === "/admin" : pathname.startsWith(h));

  async function logout() {
    await post("/api/admin/logout");
    router.replace("/admin/login");
  }

  if (me.error || settings.error) return <div className="shell py-20"><ErrorNote message="We couldn't reach the server." retry={() => { me.reload(); settings.reload(); }} /></div>;
  if (!me.data || !settings.data) return <div className="shell py-20"><Loading label="Loading dashboard" /></div>;

  return (
    <AdminCtx.Provider value={{ me: me.data, settings: settings.data, reloadSettings: settings.reload }}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
        <aside className="border-b border-line bg-cream/60 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-5 py-4 lg:block lg:px-6 lg:py-8">
            <Wordmark />
            <p className="eyebrow hidden lg:mt-3 lg:block">Studio</p>
          </div>
          <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-0 lg:px-3 lg:pb-0">
            {NAV.filter(([h]) => h !== "/admin/settings" || me.data!.role === "owner").map(([h, l]) => (
              <Link key={h} href={h} aria-current={active(h) ? "page" : undefined}
                className="whitespace-nowrap px-3 py-2.5 text-[0.8rem] font-medium uppercase tracking-[0.12em] text-ink-soft aria-[current=page]:bg-espresso aria-[current=page]:text-ivory hover:text-espresso aria-[current=page]:hover:text-ivory">
                {l}
              </Link>
            ))}
          </nav>
          <div className="hidden px-6 py-8 text-xs text-ink-soft lg:absolute lg:bottom-0 lg:block">
            <p className="font-semibold text-espresso">{me.data.full_name}</p>
            <p className="capitalize">{me.data.role}</p>
            <button onClick={logout} className="mt-3 py-2 text-espresso"><span className="link-draw">Sign out</span></button>
            <Link href="/" className="ml-4 py-2"><span className="link-draw">View site</span></Link>
          </div>
        </aside>
        <main id="main" className="min-w-0 px-5 py-8 md:px-10 lg:py-10">
          <Suspense fallback={<Loading />}>{children}</Suspense>
          <div className="mt-16 flex gap-6 text-xs text-ink-soft lg:hidden">
            <button onClick={logout} className="py-3 text-espresso"><span className="link-draw">Sign out</span></button>
            <Link href="/" className="py-3"><span className="link-draw">View site</span></Link>
          </div>
        </main>
      </div>
    </AdminCtx.Provider>
  );
}
