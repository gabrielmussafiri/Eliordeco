import Link from "next/link";
import { Photo } from "@/components/ui/Photo";
import { formatMoney, unitLabel, type Product } from "@/lib/api";

/** Gabarits éditoriaux : largeur de colonne, ratio d'image et décalage varient d'une carte à l'autre. */
const LAYOUT = [
  { col: "lg:col-span-5", ratio: "aspect-[4/5]", offset: "" },
  { col: "lg:col-span-4", ratio: "aspect-[3/4]", offset: "lg:mt-24" },
  { col: "lg:col-span-3", ratio: "aspect-[3/4]", offset: "" },
  { col: "lg:col-span-3", ratio: "aspect-[3/4]", offset: "" },
  { col: "lg:col-span-5", ratio: "aspect-[5/4]", offset: "lg:mt-16" },
  { col: "lg:col-span-4", ratio: "aspect-[4/5]", offset: "" },
];

export function ProductCard({ product, index, solo = false }: { product: Product; index: number; solo?: boolean }) {
  const l = solo ? { col: "lg:col-span-7", ratio: "aspect-[5/4]", offset: "" } : LAYOUT[index % LAYOUT.length];
  const img = product.images[0];
  return (
    <li className={`group ${l.col} ${l.offset}`}>
      <Link href={`/rentals/${product.slug}`} className="block">
        <div className={`frame relative ${l.ratio}`}>
          {img && <Photo src={img.url} alt={img.alt || product.name}
            sizes="(min-width:1024px) 40vw, (min-width:640px) 50vw, 100vw" />}
        </div>
        <div className="mt-5 flex items-start justify-between gap-6">
          <div>
            {product.category && <p className="eyebrow">{product.category.name}</p>}
            <h3 className="display h-sm mt-2 link-draw">{product.name}</h3>
          </div>
          <p className="shrink-0 pt-6 text-sm">
            {formatMoney(product.unit_price)} <span className="text-ink-soft">/ {unitLabel[product.pricing_unit]}</span>
          </p>
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          {product.total_quantity > 0
            ? `${product.total_quantity} in our inventory — confirm your dates on the product page`
            : "Currently unavailable"}
        </p>
      </Link>
    </li>
  );
}
