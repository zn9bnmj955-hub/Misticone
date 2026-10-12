/** Venue names typed in a textarea, one per line (« Terrain d'honneur », « A », « 12 »…). */

export const VENUE_NAME_MAX = 30;

/** Text → names: trimmed, empty lines dropped, each cut to the allowed length. */
export function parseVenueNames(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().slice(0, VENUE_NAME_MAX).trim())
    .filter((line) => line.length > 0);
}

export function venueNamesText(labels: string[]): string {
  return labels.join("\n");
}

/** Reserved venues that still exist, in the order of the venue list. */
export function keepReserved(reserved: string[], labels: string[]): string[] {
  const wanted = new Set(reserved);
  return labels.filter((l, i) => wanted.has(l) && labels.indexOf(l) === i);
}

export function toggleReserved(reserved: string[], label: string, labels: string[]): string[] {
  const next = reserved.includes(label) ? reserved.filter((l) => l !== label) : [...reserved, label];
  return keepReserved(next, labels);
}
