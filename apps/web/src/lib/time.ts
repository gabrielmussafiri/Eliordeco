/** Convertit une date/heure « murale » dans le fuseau de l'entreprise en instant UTC (ISO). */
export function zonedToUtcISO(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const offsetAt = (ms: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ms;
  };
  // Deux passes : correct aussi autour des changements d'heure
  let utc = wall - offsetAt(wall);
  utc = wall - offsetAt(utc);
  return new Date(utc).toISOString();
}

export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date()); // YYYY-MM-DD
}

export const TIME_SLOTS = Array.from({ length: 31 }, (_, i) => {
  const mins = 7 * 60 + i * 30;
  const h = Math.floor(mins / 60), m = mins % 60;
  const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const label = new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return { value, label };
});

/** Instant UTC (ISO) → date et heure « murales » dans un fuseau, au format des champs du formulaire. */
export function isoToZoned(iso: string, timeZone: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { date, time };
}

// ───────── Calendrier : arithmétique sur des dates « AAAA-MM-JJ » (sans fuseau, donc sans décalage) ─────────
const parts = (d: string) => d.split("-").map(Number) as [number, number, number];
export const addDays = (d: string, n: number) => {
  const [y, m, dd] = parts(d);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
};
export const weekday = (d: string) => { const [y, m, dd] = parts(d); return new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); };
export const firstOfMonth = (d: string) => d.slice(0, 8) + "01";
export const addMonths = (d: string, n: number) => { const [y, m] = parts(d); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10); };
export const formatDay = (d: string, o: Intl.DateTimeFormatOptions) => {
  const [y, m, dd] = parts(d);
  return new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, dd)));
};
