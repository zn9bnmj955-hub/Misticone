const TZ = "Europe/Paris";

/** "sam. 24 oct." */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso));
}

/** "15 h 40" — the way times are written on French posters. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === "hour")?.value ?? "";
  const m = parts.find((p) => p.type === "minute")?.value ?? "";
  return `${Number(h)} h ${m}`;
}

export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}
