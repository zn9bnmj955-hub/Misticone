/**
 * Outgoing links of the details page (pure, unit tested): directions, nearby
 * restaurants, sharing. Each one opens the right app in a single tap; when the
 * organizer gave no coordinates, the address text is used instead.
 */
export type Place = {
  lat: number | null;
  lng: number | null;
  address: string | null;
  postcode: string | null;
  city: string | null;
};

const TZ = "Europe/Paris";

/** "12 allée des Joueurs, 13400 Aubagne" */
export function placeText(p: Place): string {
  const town = [p.postcode, p.city].filter(Boolean).join(" ");
  return [p.address, town].map((s) => s?.trim()).filter(Boolean).join(", ");
}

const point = (p: Place) => (p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : null);

export type Directions = { google: string; waze: string; apple: string };

export function directionsLinks(p: Place): Directions | null {
  const ll = point(p);
  if (ll) {
    return {
      google: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
      waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
      apple: `https://maps.apple.com/?daddr=${ll}`,
    };
  }
  const text = placeText(p);
  if (!text) return null;
  const q = encodeURIComponent(text);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
    apple: `https://maps.apple.com/?daddr=${q}`,
  };
}

/** Map search for restaurants around the venue. */
export function restaurantsLink(p: Place): string | null {
  const ll = point(p);
  if (ll) return `https://www.google.com/maps/search/restaurants/@${ll},15z`;
  const town = [p.postcode, p.city].filter(Boolean).join(" ") || placeText(p);
  return town ? `https://www.google.com/maps/search/${encodeURIComponent(`restaurants ${town}`)}` : null;
}

export function shareLinks(url: string, text: string): { whatsapp: string; facebook: string } {
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  };
}

/** Phone number usable in a tel: link ("06 39 98 00 01" → "0639980001"). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+0-9]/g, "")}`;
}

/** Parts of the big date tile, Paris time: { weekday: "samedi", day: "24", month: "oct." }. */
export function dateTile(iso: string): { weekday: string; day: string; month: string } {
  const d = new Date(iso);
  const part = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...opts, timeZone: TZ }).format(d);
  return { weekday: part({ weekday: "long" }), day: part({ day: "numeric" }), month: part({ month: "short" }) };
}

/** "samedi 24 octobre 2026" (year omitted when it is the current one). */
export function longDay(iso: string, nowMs?: number): string {
  const d = new Date(iso);
  const year = (ms: number) => new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone: TZ }).format(new Date(ms));
  const sameYear = nowMs !== undefined && year(d.getTime()) === year(nowMs);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: TZ,
  }).format(d);
}
