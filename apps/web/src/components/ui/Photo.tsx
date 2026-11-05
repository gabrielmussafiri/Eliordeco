import Image from "next/image";

/** Image de produit : remplit son parent (qui doit être `relative`). Les SVG (visuels de
 *  substitution) ne passent pas par l'optimiseur. */
export function Photo({ src, alt, sizes, priority = false, className = "" }:
  { src: string; alt: string; sizes: string; priority?: boolean; className?: string }) {
  return (
    <Image src={src} alt={alt} fill sizes={sizes} priority={priority}
      unoptimized={src.endsWith(".svg")} className={`object-cover ${className}`} />
  );
}
