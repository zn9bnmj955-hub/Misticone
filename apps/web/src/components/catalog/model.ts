import { CATEGORIES, COMPETITION_FORMATS, enabledSports, getSport, type Category, type CompetitionFormat, type SportConfig } from "@orgasport/sports";
import { fmt, getMessages } from "@/i18n";
import { catalogFiltersToQuery, RADII, type CatalogFilters, type CatalogRow, type Eligibility } from "@/lib/data/catalog";
import type { TournamentCard as HomeCard } from "@/lib/data/tournaments";
import { formatDay, formatTime } from "@/lib/format";
import { registrationWindow, type RegistrationWindow } from "@/lib/tournament/registration-rules";

/**
 * Pure helpers of the catalog page (/concours): filter options, active
 * filter chips, card view model and map markers. No I/O, unit tested.
 */

export const CATALOG_PATH = "/concours";

/** A catalog row plus the waiting-list setting (looked up only for full tournaments). */
export type CatalogCardRow = CatalogRow & { waitlist_enabled?: boolean };

/**
 * Filters that actually apply: distance filter and distance sort need a
 * starting point (explicit position, profile city or device city).
 */
export function effectiveFilters(f: CatalogFilters, hasOrigin: boolean): CatalogFilters {
  return hasOrigin ? f : { ...f, radiusKm: null, sort: "date" };
}

/**
 * Link to the catalog with these filters. The sport is left out on purpose:
 * it lives in the SportBar cookie, so that the sport chips keep working.
 */
export function catalogHref(f: CatalogFilters, patch: Partial<CatalogFilters> = {}): string {
  return CATALOG_PATH + catalogFiltersToQuery({ ...f, ...patch, sport: null });
}

/** « Voir plus »: same filters, more cards (page 2 shows the first 100, and so on). */
export function pageHref(f: CatalogFilters, page: number): string {
  const q = new URLSearchParams(catalogFiltersToQuery({ ...f, sport: null }).slice(1));
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return CATALOG_PATH + (s ? `?${s}` : "");
}

/** Page number from the URL (« Voir plus »), 1 to `max`. */
export function parsePage(raw: string | string[] | undefined, max: number): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) ? Math.min(max, Math.max(1, n)) : 1;
}

/** "Tout effacer": back to the defaults, staying on the same view. */
export function clearAllHref(f: CatalogFilters): string {
  return CATALOG_PATH + (f.view === "map" ? "?vue=carte" : "");
}

function sportsFor(sport: string | null): SportConfig[] {
  const one = sport ? getSport(sport) : undefined;
  return one?.enabled ? [one] : enabledSports();
}

/** Competition formats offered by the selected sport (or by all sports for "Tous"). */
export function formatOptions(sport: string | null, current: CompetitionFormat | null = null): CompetitionFormat[] {
  const allowed = new Set<CompetitionFormat>(sportsFor(sport).flatMap((s) => s.competitionFormats));
  if (current) allowed.add(current);
  return COMPETITION_FORMATS.filter((f) => allowed.has(f));
}

/** Categories of the selected sport ("all" is the empty choice, not an option). */
export function categoryOptions(sport: string | null, current: Category | null = null): Category[] {
  const allowed = new Set<Category>(sportsFor(sport).flatMap((s) => s.categories));
  if (current) allowed.add(current);
  return CATEGORIES.filter((c) => c !== "all" && allowed.has(c));
}

export function eligibilityLabel(e: Eligibility): string {
  const t = getMessages().tournament;
  return e === "licensed" ? t.licensed : e === "mixed" ? t.mixed : t.open;
}

/** Next radius when nothing is found ("Élargir à 50 km"), null at the maximum. */
export function widerRadius(radiusKm: number | null): number | null {
  if (radiusKm === null) return null;
  return RADII.find((r) => r > radiusKm) ?? null;
}

export type FilterChip = { key: string; label: string; href: string };

/** One chip per active filter, each with a link that removes only that filter. */
export function activeChips(f: CatalogFilters): FilterChip[] {
  const m = getMessages();
  const c = m.catalogPage;
  const chips: FilterChip[] = [];
  const add = (key: string, label: string, patch: Partial<CatalogFilters>) => chips.push({ key, label, href: catalogHref(f, patch) });
  if (f.when !== "all") add("when", c.when[f.when], { when: "all" });
  if (f.point) add("point", c.chips.aroundMe, { point: null });
  if (f.radiusKm) add("radius", fmt(c.filters.radiusKm, { km: f.radiusKm }), { radiusKm: null });
  if (f.format) add("format", m.formatLabels[f.format], { format: null });
  if (f.eligibility) add("eligibility", eligibilityLabel(f.eligibility), { eligibility: null });
  if (f.category) add("category", m.categoryLabels[f.category], { category: null });
  if (f.places) add("places", c.chips.places, { places: false });
  if (f.sort === "distance") add("sort", c.chips.sortDistance, { sort: "date" });
  return chips;
}

/** Number of filters set inside the "Filtres" panel (date and position are outside). */
export function panelFilterCount(f: CatalogFilters): number {
  return [f.radiusKm, f.format, f.eligibility, f.category, f.places || null, f.sort === "distance" || null].filter(Boolean).length;
}

export function countLabel(count: number, more: boolean): string {
  const c = getMessages().catalogPage.count;
  if (more) return fmt(c.atLeast, { count });
  return count === 0 ? c.zero : count === 1 ? c.one : fmt(c.many, { count });
}

/** What a card shows, from either a catalog row or the home feed shape. */
export type CardModel = {
  code: string;
  name: string;
  status: CatalogRow["status"];
  sportSlug: string;
  startsAt: string | null;
  city: string | null;
  distanceKm: number | null;
  teamFormat: string | null;
  competitionFormat: CompetitionFormat | null;
  feeCents: number;
  feePer: string;
  prizeText: string | null;
  eligibility: Eligibility;
  clubName: string | null;
  activeTeams: number;
  maxTeams: number | null;
  waitlistTeams: number;
  /** Online registration state; null when unknown (home feed cards). */
  window: RegistrationWindow | null;
};

function isCatalogRow(t: HomeCard | CatalogCardRow): t is CatalogCardRow {
  return "active_teams" in t;
}

export function toCardModel(t: HomeCard | CatalogCardRow, nowMs?: number): CardModel {
  const common = {
    code: t.short_code ?? "",
    name: t.name,
    status: t.status,
    sportSlug: t.sport_slug,
    startsAt: t.starts_at,
    city: t.city,
    teamFormat: t.team_format,
    feeCents: t.fee_cents,
    feePer: t.fee_per,
    prizeText: t.prize_text,
    eligibility: t.eligibility,
    maxTeams: t.max_teams,
  };
  if (!isCatalogRow(t)) {
    return { ...common, distanceKm: t.distanceKm ?? null, competitionFormat: null, clubName: t.club?.name ?? null, activeTeams: t.teamCount, waitlistTeams: 0, window: null };
  }
  const window =
    nowMs === undefined
      ? null
      : registrationWindow(
          {
            status: t.status,
            registration_mode: t.registration_mode,
            registration_closes_at: t.registration_closes_at,
            max_teams: t.max_teams,
            waitlist_enabled: t.waitlist_enabled ?? true,
            team_format: t.team_format,
            eligibility: t.eligibility,
            category: t.category,
            config: null,
          },
          t.active_teams,
          nowMs,
        );
  return {
    ...common,
    distanceKm: t.distance_km,
    competitionFormat: (COMPETITION_FORMATS as readonly string[]).includes(t.format ?? "") ? (t.format as CompetitionFormat) : null,
    clubName: t.club_name,
    activeTeams: t.active_teams,
    waitlistTeams: t.waitlist_teams,
    window,
  };
}

export type Places = { text: string; fill: number | null; full: boolean };

/** Gauge text: « 23 / 64 équipes · 41 places », « Complet · liste d'attente »… */
export function placesInfo(c: CardModel): Places {
  const t = getMessages().catalogPage.card;
  if (c.maxTeams === null || c.maxTeams <= 0) return { text: fmt(t.teamsNoMax, { count: c.activeTeams }), fill: null, full: false };
  const fill = Math.min(1, c.activeTeams / c.maxTeams);
  const vars = { count: c.activeTeams, max: c.maxTeams };
  // Places left only matter while registrations are open.
  if (c.status !== "published") return { text: fmt(t.teams, vars), fill, full: false };
  const left = c.maxTeams - c.activeTeams;
  if (left > 0) return { text: fmt(left === 1 ? t.placesOne : t.places, { ...vars, left }), fill, full: false };
  const waiting = c.waitlistTeams > 0 ? ` · ${fmt(t.waiting, { count: c.waitlistTeams })}` : "";
  return { text: (c.window === "waitlist" ? t.fullWaitlist : t.full) + waiting, fill: 1, full: true };
}

export type StatusBadge = { tone: "live" | "accent" | "warning" | "neutral"; label: string };

export function statusBadge(c: CardModel): StatusBadge {
  const m = getMessages();
  const t = m.catalogPage.card;
  if (c.status === "live") return { tone: "live", label: m.status.live };
  if (c.status !== "published" || c.window === null) return { tone: "neutral", label: m.status[c.status] };
  switch (c.window) {
    case "open":
      return { tone: "accent", label: t.windowOpen };
    case "waitlist":
      return { tone: "warning", label: t.windowWaitlist };
    case "full":
      return { tone: "neutral", label: t.windowFull };
    case "onsite_only":
      return { tone: "neutral", label: t.windowOnsite };
    default:
      return { tone: "neutral", label: t.windowClosed };
  }
}

export type CardAction = { href: string; label: string; kind: "register" | "live" };

/** Direct shortcut from the card: register online, or follow the live tournament. */
export function cardAction(c: CardModel): CardAction | null {
  const t = getMessages().catalogPage.card;
  if (!c.code) return null;
  if (c.status === "live" || c.status === "check_in") return { href: `/c/${c.code}`, label: t.live, kind: "live" };
  if (c.window === "open") return { href: `/c/${c.code}/inscription`, label: t.register, kind: "register" };
  if (c.window === "waitlist") return { href: `/c/${c.code}/inscription`, label: t.waitlist, kind: "register" };
  return null;
}

export function detailsHref(code: string): string {
  return `${CATALOG_PATH}/${code}`;
}

/** « sam. 24 oct. · 14 h 30 » */
export function whenLabel(iso: string | null): string {
  return iso ? `${formatDay(iso)} · ${formatTime(iso)}` : "";
}

export type MapItem = { code: string; name: string; when: string; href: string };
export type MapPoint = { key: string; lat: number; lng: number; city: string | null; accentToken: string | null; items: MapItem[] };

/**
 * One marker per place: tournaments held at the same spot (same club
 * ground) share a marker whose popup lists them all.
 */
export function mapPoints<T extends CatalogRow>(rows: T[]): { points: MapPoint[]; withoutPosition: T[] } {
  const byPlace = new Map<string, MapPoint & { sports: Set<string> }>();
  const withoutPosition: T[] = [];
  for (const r of rows) {
    if (r.lat === null || r.lng === null || !r.short_code) {
      withoutPosition.push(r);
      continue;
    }
    const key = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
    let p = byPlace.get(key);
    if (!p) {
      p = { key, lat: r.lat, lng: r.lng, city: r.city, accentToken: null, items: [], sports: new Set() };
      byPlace.set(key, p);
    }
    p.sports.add(r.sport_slug);
    p.items.push({ code: r.short_code, name: r.name, when: [whenLabel(r.starts_at), r.city].filter(Boolean).join(" · "), href: detailsHref(r.short_code) });
  }
  const points = [...byPlace.values()].map(({ sports, ...p }) => ({
    ...p,
    accentToken: sports.size === 1 ? (getSport([...sports][0]!)?.accentToken ?? null) : null,
  }));
  return { points, withoutPosition };
}
