import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { CATEGORIES, COMPETITION_FORMATS, type Category, type CompetitionFormat } from "@orgasport/sports";
import { createPublicClient } from "@/lib/supabase/public";
import { isoToParis, parisToIso, parisDatePlus } from "@/lib/tournament-form/time";
import { ALL_SPORTS, normalizeSportFilter, offeredSportSlugs } from "@/lib/prefs";

/**
 * Catalog filters travel in the URL (plain GET form: works without
 * JavaScript, shareable). French parameter names, like the rest of the URLs.
 */
export type When = "all" | "today" | "weekend" | "week" | "month";
export type Eligibility = "open" | "licensed" | "mixed";

export type CatalogFilters = {
  sport: string | null;
  when: When;
  radiusKm: number | null;
  format: CompetitionFormat | null;
  eligibility: Eligibility | null;
  category: Category | null;
  places: boolean;
  view: "list" | "map";
  sort: "date" | "distance";
  /** Explicit point ("autour de moi"), else the person's city is used. */
  point: { lat: number; lng: number } | null;
};

export const RADII = [10, 30, 50, 100, 200] as const;
const WHEN: Record<string, When> = { aujourdhui: "today", weekend: "weekend", semaine: "week", mois: "month" };
const WHEN_PARAM: Record<When, string | null> = { all: null, today: "aujourdhui", weekend: "weekend", week: "semaine", month: "mois" };
const ELIG: Record<string, Eligibility> = { ouvert: "open", licencies: "licensed", mixte: "mixed" };
const ELIG_PARAM: Record<Eligibility, string> = { open: "ouvert", licensed: "licencies", mixed: "mixte" };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseCatalogFilters(sp: Params, sportCookie: string | null): CatalogFilters {
  // A sport that is not offered (football switched off) goes back to the offered one.
  const raw = one(sp.sport) || sportCookie || ALL_SPORTS;
  const sport = normalizeSportFilter(/^[a-z0-9-]+$/.test(raw) ? raw : null);
  const radius = Number(one(sp.rayon));
  const lat = Number(one(sp.lat));
  const lng = Number(one(sp.lng));
  const format = one(sp.format);
  const category = one(sp.categorie);
  return {
    sport: sport !== ALL_SPORTS ? sport : null,
    when: WHEN[one(sp.quand)] ?? "all",
    radiusKm: (RADII as readonly number[]).includes(radius) ? radius : null,
    format: (COMPETITION_FORMATS as readonly string[]).includes(format) ? (format as CompetitionFormat) : null,
    eligibility: ELIG[one(sp.ouverture)] ?? null,
    category: (CATEGORIES as readonly string[]).includes(category) && category !== "all" ? (category as Category) : null,
    places: one(sp.places) === "1",
    view: one(sp.vue) === "carte" ? "map" : "list",
    sort: one(sp.tri) === "distance" ? "distance" : "date",
    point:
      Number.isFinite(lat) && Number.isFinite(lng) && one(sp.lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
        ? { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 }
        : null,
  };
}

/** Back to URL parameters (links that change one filter keep the others). */
export function catalogFiltersToQuery(f: CatalogFilters, patch: Partial<CatalogFilters> = {}): string {
  const x = { ...f, ...patch };
  const q = new URLSearchParams();
  if (x.sport) q.set("sport", x.sport);
  const when = WHEN_PARAM[x.when];
  if (when) q.set("quand", when);
  if (x.radiusKm) q.set("rayon", String(x.radiusKm));
  if (x.format) q.set("format", x.format);
  if (x.eligibility) q.set("ouverture", ELIG_PARAM[x.eligibility]);
  if (x.category) q.set("categorie", x.category);
  if (x.places) q.set("places", "1");
  if (x.view === "map") q.set("vue", "carte");
  if (x.sort === "distance") q.set("tri", "distance");
  if (x.point) {
    q.set("lat", String(x.point.lat));
    q.set("lng", String(x.point.lng));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * Date window in Paris time. Rounded to the day so that the cache key stays
 * the same all day long.
 */
export function whenRange(when: When, nowMs: number): { from: string | null; to: string | null } {
  if (when === "all") return { from: null, to: null };
  const today = isoToParis(new Date(nowMs).toISOString()).date;
  const start = parisToIso(today, "00:00");
  const dayEnd = (days: number) => parisToIso(parisDatePlus(nowMs, days), "00:00");
  if (when === "today") return { from: start, to: dayEnd(1) };
  if (when === "week") return { from: start, to: dayEnd(7) };
  if (when === "month") return { from: start, to: dayEnd(31) };
  // Weekend: from Saturday 00:00 (or today if already the weekend) to Monday 00:00.
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const toSaturday = dow === 6 || dow === 0 ? 0 : 6 - dow;
  const toMonday = dow === 0 ? 1 : dow === 6 ? 2 : 8 - dow;
  return { from: toSaturday === 0 ? start : dayEnd(toSaturday), to: dayEnd(toMonday) };
}

export type CatalogRow = {
  id: string;
  short_code: string;
  name: string;
  status: "published" | "registration_closed" | "check_in" | "live" | "finished" | "archived" | "draft";
  sport_slug: string;
  starts_at: string | null;
  registration_closes_at: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  team_format: string | null;
  category: string;
  eligibility: Eligibility;
  registration_mode: "online" | "onsite" | "both";
  max_teams: number | null;
  fee_cents: number;
  fee_per: string;
  prize_text: string | null;
  format: string | null;
  club_name: string;
  club_slug: string;
  active_teams: number;
  waitlist_teams: number;
  distance_km: number | null;
};

/** Arguments of the SQL function catalog_tournaments (see migration 0700). */
export type CatalogQuery = {
  sports?: string[];
  from?: string | null;
  to?: string | null;
  lat?: number;
  lng?: number;
  radius_km?: number;
  format?: string;
  eligibility?: string;
  category?: string;
  has_places?: boolean;
  statuses?: string[];
  sort?: "date" | "distance";
  limit?: number;
  offset?: number;
};

export function toCatalogQuery(f: CatalogFilters, origin: { lat: number; lng: number } | null, nowMs: number): CatalogQuery {
  const range = whenRange(f.when, nowMs);
  const q: CatalogQuery = { limit: 100 };
  // « All sports » means all the sports offered: tournaments of a sport switched off stay hidden.
  q.sports = f.sport ? [f.sport] : offeredSportSlugs();
  if (range.from) q.from = range.from;
  if (range.to) q.to = range.to;
  if (origin) {
    q.lat = origin.lat;
    q.lng = origin.lng;
    if (f.radiusKm) q.radius_km = f.radiusKm;
    if (f.sort === "distance") q.sort = "distance";
  }
  if (f.format) q.format = f.format;
  if (f.eligibility) q.eligibility = f.eligibility;
  if (f.category) q.category = f.category;
  if (f.places) q.has_places = true;
  return q;
}

/** Published tournaments matching the filters (cached a few minutes per filter combination). */
export async function listCatalog(query: CatalogQuery): Promise<CatalogRow[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("tournaments");
  const { data, error } = await createPublicClient().rpc("catalog_tournaments", { p: query as never });
  if (error) throw error;
  return (data ?? []) as CatalogRow[];
}
