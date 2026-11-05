import type { PricingUnit } from "./api";

/** Même règle d'arrondi que le serveur. Sert uniquement à l'estimation affichée ;
 *  le total officiel est toujours recalculé par l'API. */
export function billableUnits(unit: PricingUnit, startISO: string, endISO: string): number {
  const hours = (new Date(endISO).getTime() - new Date(startISO).getTime()) / 3_600_000;
  const per = { hour: 1, day: 24, weekend: 72, week: 168 }[unit];
  return Math.max(1, Math.ceil(hours / per));
}
