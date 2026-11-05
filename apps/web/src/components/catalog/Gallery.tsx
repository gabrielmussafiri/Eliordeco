"use client";

import { useState } from "react";
import { Photo } from "@/components/ui/Photo";
import type { ProductImage } from "@/lib/api";

export function Gallery({ images, name }: { images: ProductImage[]; name: string }) {
  const [active, setActive] = useState(0);
  if (!images.length) {
    return <div className="frame flex aspect-[4/5] items-center justify-center text-sm text-ink-soft">Photo coming soon</div>;
  }
  const main = images[active];
  return (
    <div className={`grid gap-4 ${images.length > 1 ? "sm:grid-cols-[5rem_1fr]" : ""}`}>
      {images.length > 1 && <div className="order-2 flex gap-3 sm:order-1 sm:flex-col" role="tablist" aria-label={`${name} photos`}>
        {images.map((im, i) => (
          <button key={im.id} role="tab" aria-selected={i === active} aria-label={`Photo ${i + 1} of ${images.length}`}
            onClick={() => setActive(i)}
            className={`frame relative aspect-square w-16 shrink-0 border transition-opacity sm:w-full ${
              i === active ? "border-espresso" : "border-transparent opacity-60 hover:opacity-100"}`}>
            <Photo src={im.url} alt="" sizes="80px" />
          </button>
        ))}
      </div>}
      <div className="frame relative order-1 aspect-[4/5] sm:order-2" role="tabpanel">
        <Photo key={main.id} src={main.url} alt={main.alt || name} priority sizes="(min-width:1024px) 55vw, 100vw" className="rise" />
      </div>
    </div>
  );
}
