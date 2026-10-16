/**
 * Calendar file (.ics, RFC 5545) for "Ajouter à mon agenda". Works with
 * Google Agenda, Apple Calendrier and Outlook. The event has a start only:
 * the end of a competition cannot be predicted, so no DTEND is written.
 */
export type IcsEvent = {
  uid: string;
  start: string;
  /** DTSTAMP: when the file was produced. */
  stamp: string;
  summary: string;
  location?: string | null;
  geo?: { lat: number; lng: number } | null;
  url?: string | null;
  description?: string | null;
};

/** Escapes text values: backslash, semicolon, comma, newlines. */
export function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** UTC date-time in the basic format: 20261024T123000Z. */
export function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Lines longer than 75 octets are folded (continuation lines start with a space). */
export function foldLine(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = bytes.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + n > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(e: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OrgaSport//Concours//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${icsDate(e.stamp)}`,
    `DTSTART:${icsDate(e.start)}`,
    `SUMMARY:${icsEscape(e.summary)}`,
    e.location ? `LOCATION:${icsEscape(e.location)}` : null,
    e.geo ? `GEO:${e.geo.lat.toFixed(6)};${e.geo.lng.toFixed(6)}` : null,
    e.url ? `URL:${e.url}` : null,
    e.description ? `DESCRIPTION:${icsEscape(e.description)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => l !== null);
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
