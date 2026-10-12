/**
 * Geocoding through the French state service (Géoplateforme IGN, formerly
 * "API Adresse"). Free, no key. The provider is isolated here so it can be
 * swapped without touching the rest of the app.
 */
export type Place = { label: string; city: string; postcode: string; lat: number; lng: number };

const ENDPOINT = "https://data.geopf.fr/geocodage/search";

type Feature = {
  geometry: { coordinates: [number, number] };
  properties: { label?: string; city?: string; name?: string; postcode?: string };
};

export function parseGeocodeResponse(json: unknown): Place[] {
  const features = (json as { features?: Feature[] })?.features;
  if (!Array.isArray(features)) return [];
  return features.flatMap((f) => {
    const [lng, lat] = f.geometry?.coordinates ?? [];
    const p = f.properties ?? {};
    if (typeof lat !== "number" || typeof lng !== "number") return [];
    return [{ label: p.label ?? p.name ?? "", city: p.city ?? p.name ?? "", postcode: p.postcode ?? "", lat, lng }];
  });
}

export async function geocode(q: string, kind: "city" | "address", signal?: AbortSignal): Promise<Place[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "5");
  url.searchParams.set("index", "address");
  if (kind === "city") url.searchParams.set("type", "municipality");
  const res = await fetch(url, { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  return parseGeocodeResponse(await res.json());
}
