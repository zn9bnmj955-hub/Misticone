const TZ = "Europe/Paris";

/** "16 octobre 2026", "1er janvier 2025" — a calendar date ("2026-10-16"), no time zone shift. */
export function formatLongDate(isoDate: string | null | undefined): string {
  const m = isoDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate) : null;
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const text = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  return text.replace(/^1 /, "1er ");
}

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
