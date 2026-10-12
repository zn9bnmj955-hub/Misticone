import { getMessages } from "@/i18n";

/** Small display helpers for the creation form (dates typed as "YYYY-MM-DD", times as "HH:MM"). */

/** Competition format name, shared with the catalog and the tournament pages. */
export function formatLabel(format: string): string {
  return (getMessages().formatLabels as Record<string, string>)[format] ?? format;
}

/** Category name, shared with the catalog and the tournament pages. */
export function categoryLabel(category: string): string {
  return (getMessages().categoryLabels as Record<string, string>)[category] ?? category;
}

/** "2026-10-24" → "samedi 24 octobre 2026". */
export function longDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  // Noon UTC is the same calendar day everywhere in metropolitan France.
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/** "14:30" → "14 h 30", "09:05" → "9 h 05" (French poster style). */
export function hm(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  return `${Number(match[1])} h ${match[2]}`;
}
