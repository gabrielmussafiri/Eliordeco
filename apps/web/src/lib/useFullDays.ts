"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { addDays, weekday } from "./time";

export interface Item { product_id: number; quantity: number }

/** Jours complets (aucun créneau avec assez de stock) pour les articles choisis, chargés mois par mois.
 *  Aide visuelle uniquement : le serveur revérifie toujours la période exacte. */
export function useFullDays(items: Item[]) {
  const key = JSON.stringify(items);
  const [store, setStore] = useState<{ key: string; months: Record<string, string[]> }>({ key, months: {} });
  const asked = useRef(new Set<string>()); // requêtes déjà lancées (en cours ou terminées), par sélection et par mois

  const request = useCallback((monthFirst: string) => {
    const list: Item[] = JSON.parse(key);
    const id = `${key}|${monthFirst}`;
    if (!list.length || asked.current.has(id)) return;
    asked.current.add(id);
    const gridStart = addDays(monthFirst, -weekday(monthFirst)); // la grille affiche aussi les jours voisins
    api<{ full: string[] }>("/api/availability/days", { method: "POST", json: { items: list, from: gridStart, days: 42 } })
      .then((r) => setStore((s) => ({ key, months: { ...(s.key === key ? s.months : {}), [monthFirst]: r.full } })))
      .catch(() => asked.current.delete(id)); // sans cette aide, tous les jours restent choisissables ; le serveur vérifie
  }, [key]);

  const full = useMemo(() => new Set(store.key === key ? Object.values(store.months).flat() : []), [store, key]);
  return { full, request };
}
