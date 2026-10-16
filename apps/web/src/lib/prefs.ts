/**
 * Preferences remembered on the device (guest or signed-in): chosen sports,
 * city, and the sport filter of the story-style selector. Stored in cookies so
 * the server can personalize the first render without JavaScript.
 */
import { enabledSports } from "@orgasport/sports";

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

/** Slugs of the sports offered on the site (`enabled` in packages/sports: football is kept in the code but off). */
export function offeredSportSlugs(): string[] {
  return enabledSports().map((s) => s.slug);
}

/** Keeps only the sports offered (an old cookie or profile may still list football). */
export function onlyOfferedSports(slugs: readonly string[]): string[] {
  const offered = offeredSportSlugs();
  return slugs.filter((s) => offered.includes(s));
}

/**
 * Value of the sport selector cookie: an offered sport or « all ». A sport
 * that is not offered (os_sport=football) goes back to the only sport left,
 * or to « all » when several sports are offered.
 */
export function normalizeSportFilter(value: string | null | undefined): string {
  const offered = offeredSportSlugs();
  if (value && (value === ALL_SPORTS || offered.includes(value))) return value;
  if (!value) return ALL_SPORTS;
  return offered.length === 1 ? offered[0]! : ALL_SPORTS;
}

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
