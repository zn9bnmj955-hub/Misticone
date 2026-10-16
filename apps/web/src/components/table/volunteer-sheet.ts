/**
 * Content of the printable volunteer sheet (QR code + PIN). The PIN lives only
 * in this object, in memory: the addresses below never contain it, so it never
 * reaches a URL, a request or a server log.
 */
export interface VolunteerSheet {
  code: string;
  tournamentName: string;
  label: string;
  pin: string;
  /** Address the volunteer opens (shown under the QR code). */
  tablePath: string;
  /** Image of the QR code pointing to the scoring table. */
  qrSrc: string;
}

export function volunteerSheet(input: { code: string; tournamentName: string; label: string; pin: string }): VolunteerSheet {
  const code = encodeURIComponent(input.code);
  return { ...input, tablePath: `/c/${code}/table`, qrSrc: `/c/${code}/qr.svg?cible=table` };
}

/** "482193" → "482 193": easier to read aloud and to type. */
export function spacedPin(pin: string): string {
  return pin.replace(/^(\d{3})(\d{3})$/, "$1 $2");
}
