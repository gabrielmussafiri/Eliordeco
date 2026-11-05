import { Suspense } from "react";
import { Wordmark } from "@/components/ui/Wordmark";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-espresso focus:px-4 focus:py-2 focus:text-ivory">
        Skip to content
      </a>
      <Suspense fallback={<header className="border-b border-line"><div className="shell flex h-[4.5rem] items-center"><Wordmark /></div></header>}>
        <Nav />
      </Suspense>
      <main id="main" className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
