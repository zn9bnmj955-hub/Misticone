import "server-only";
import { cacheLife, cacheTag } from "next/cache";

/**
 * Weather forecast for a tournament: MET Norway (api.met.no, free, commercial
 * use allowed with attribution CC BY 4.0, identifiable User-Agent required).
 * Cached one hour per place; any failure just hides the block (the link to a
 * weather site is always shown).
 */
export type WeatherKind = "sun" | "partly" | "cloud" | "rain" | "showers" | "snow" | "fog" | "storm";

export type Forecast = {
  /** Time of the forecast step used (closest to the start). */
  at: string;
  kind: WeatherKind;
  temperatureC: number | null;
  precipitationMm: number | null;
  windKmh: number | null;
};

const API = "https://api.met.no/weatherdata/locationforecast/2.0/compact";
/** MET Norway forecasts go about 9 days ahead. */
const HORIZON_MS = 9 * 86_400_000;

export function symbolKind(symbol: string): WeatherKind {
  const s = symbol.replace(/_(day|night|polartwilight)$/, "");
  if (s.includes("thunder")) return "storm";
  if (s.includes("snow") || s.includes("sleet")) return "snow";
  if (s.includes("showers")) return "showers";
  if (s.includes("rain")) return "rain";
  if (s === "fog") return "fog";
  if (s === "clearsky") return "sun";
  if (s === "fair" || s === "partlycloudy") return "partly";
  return "cloud";
}

type MetStep = {
  time: string;
  data: {
    instant: { details: { air_temperature?: number; wind_speed?: number } };
    next_1_hours?: { summary: { symbol_code: string }; details?: { precipitation_amount?: number } };
    next_6_hours?: { summary: { symbol_code: string }; details?: { precipitation_amount?: number } };
  };
};

/** Picks the forecast step closest to the start time (pure, tested with a fixture). */
export function parseMetForecast(json: unknown, targetIso: string): Forecast | null {
  const steps = (json as { properties?: { timeseries?: MetStep[] } })?.properties?.timeseries;
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const target = Date.parse(targetIso);
  let best: MetStep | null = null;
  for (const s of steps) {
    if (!s?.data?.instant) continue;
    if (!best || Math.abs(Date.parse(s.time) - target) < Math.abs(Date.parse(best.time) - target)) best = s;
  }
  if (!best || Math.abs(Date.parse(best.time) - target) > 6 * 3600_000) return null;
  const next = best.data.next_1_hours ?? best.data.next_6_hours;
  if (!next) return null;
  const d = best.data.instant.details;
  return {
    at: best.time,
    kind: symbolKind(next.summary.symbol_code),
    temperatureC: typeof d.air_temperature === "number" ? Math.round(d.air_temperature) : null,
    precipitationMm: typeof next.details?.precipitation_amount === "number" ? next.details.precipitation_amount : null,
    windKmh: typeof d.wind_speed === "number" ? Math.round(d.wind_speed * 3.6) : null,
  };
}

async function fetchMet(lat: number, lng: number): Promise<unknown | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("weather");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://orgasport.fr";
  try {
    const res = await fetch(`${API}?lat=${lat}&lon=${lng}`, {
      headers: { "user-agent": process.env.WEATHER_USER_AGENT || `OrgaSport/1.0 (+${site})`, accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getForecast(lat: number | null, lng: number | null, startsAt: string | null, nowMs: number): Promise<Forecast | null> {
  if (lat == null || lng == null || !startsAt) return null;
  const start = Date.parse(startsAt);
  if (start - nowMs > HORIZON_MS || nowMs - start > 6 * 3600_000) return null;
  const json = await fetchMet(Math.round(lat * 100) / 100, Math.round(lng * 100) / 100);
  return json ? parseMetForecast(json, startsAt) : null;
}

/** Always available, even when the forecast is not. */
export function weatherLink(lat: number | null, lng: number | null, city: string | null): string {
  if (lat != null && lng != null) return `https://www.yr.no/en/forecast/daily-table/${lat.toFixed(4)},${lng.toFixed(4)}`;
  return `https://meteofrance.com/recherche/${encodeURIComponent(city ?? "")}`;
}
