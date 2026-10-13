/**
 * Dates of the creation form are typed in local French time (Europe/Paris).
 * These helpers convert "2026-10-24" + "14:30" to an ISO instant and back,
 * daylight saving time included, without any date library.
 */
const TZ = "Europe/Paris";

export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parisParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute") };
}

/** "2026-10-24", "14:30" → "2026-10-24T12:30:00.000Z" (Paris summer time). */
export function parisToIso(date: string, time: string): string {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wanted;
  // Two corrections are enough to land on the right offset (CET/CEST).
  for (let i = 0; i < 2; i++) {
    const p = parisParts(guess);
    const shown = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
    guess += wanted - shown;
  }
  return new Date(guess).toISOString();
}

/** ISO instant → Paris date "YYYY-MM-DD" and time "HH:MM". */
export function isoToParis(iso: string): { date: string; time: string } {
  const p = parisParts(new Date(iso).getTime());
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

/** "14:30" − 45 min → "13:45" (clamped to the same day). */
export function shiftTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "2026-10-24" + n calendar days (no time zone involved). */
export function addDays(date: string, days: number): string {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

/** Paris calendar date of an instant, plus `days` calendar days (DST-safe). */
export function parisDatePlus(nowMs: number, days: number): string {
  return addDays(isoToParis(new Date(nowMs).toISOString()).date, days);
}

/** Next Saturday (Paris), at least `minDays` from now: a sensible default date. */
export function nextSaturday(nowMs: number, minDays = 7): string {
  for (let i = minDays; i < minDays + 7; i++) {
    const date = parisDatePlus(nowMs, i);
    const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
    if (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === 6) return date;
  }
  return parisDatePlus(nowMs, minDays);
}
