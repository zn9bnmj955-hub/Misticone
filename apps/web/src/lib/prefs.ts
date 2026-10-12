/**
 * Preferences remembered on the device (guest or signed-in): chosen sports,
 * city, and the sport filter of the story-style selector. Stored in cookies so
 * the server can personalize the first render without JavaScript.
 */
export const PREFS_COOKIE = "os_prefs";
export const SPORT_COOKIE = "os_sport";
export const ONBOARDED_COOKIE = "os_onboarded";

export type DevicePrefs = {
  sports: string[];
  city?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
};

export const ALL_SPORTS = "all";

export function parsePrefs(raw: string | undefined): DevicePrefs | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Partial<DevicePrefs>;
    if (!Array.isArray(v.sports)) return null;
    return {
      sports: v.sports.filter((s): s is string => typeof s === "string").slice(0, 20),
      city: typeof v.city === "string" ? v.city.slice(0, 80) : undefined,
      postcode: typeof v.postcode === "string" ? v.postcode.slice(0, 10) : undefined,
      lat: typeof v.lat === "number" ? v.lat : undefined,
      lng: typeof v.lng === "number" ? v.lng : undefined,
      radiusKm: typeof v.radiusKm === "number" ? v.radiusKm : undefined,
    };
  } catch {
    return null;
  }
}

export function serializePrefs(p: DevicePrefs): string {
  return encodeURIComponent(JSON.stringify(p));
}

export const ONE_YEAR = 60 * 60 * 24 * 365;
