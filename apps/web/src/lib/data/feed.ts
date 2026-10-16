import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { clubLogoUrl } from "@/lib/data/clubs";
import { distanceKm, listUpcomingTournaments, type TournamentCard } from "@/lib/data/tournaments";
import { rankFeed, type FeedPrefs, type Rankable } from "@/lib/feed/rank";
import type { Viewer } from "@/lib/viewer";
import { offeredSportSlugs } from "@/lib/prefs";

/**
 * Items of the personalized home feed. The public parts are cached queries
 * (tags `tournaments`, `announcements`, `clubs`, `news`) keyed by sports and
 * rounded dates; only the person's follows are read per request. Ranking is
 * done by the pure `rankFeed`.
 */

export type FeedResult = {
  code: string;
  name: string;
  clubName: string | null;
  city: string | null;
  startsAt: string | null;
  teamCount: number;
};
export type FeedAnnouncement = {
  title: string;
  body: string | null;
  linkUrl: string | null;
  clubName: string | null;
  clubSlug: string | null;
  publishedAt: string | null;
};
export type FeedClub = { name: string; slug: string; city: string | null; logoUrl: string | null };
export type FeedNews = { title: string; url: string; source: string; publishedAt: string | null };

export type FeedItem = Rankable &
  (
    | { kind: "upcoming" | "closing"; tournament: TournamentCard }
    | { kind: "result"; result: FeedResult }
    | { kind: "announcement"; announcement: FeedAnnouncement }
    | { kind: "newClub"; club: FeedClub }
    | { kind: "news"; news: FeedNews }
  );

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SLUG = /^[a-z0-9-]+$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Rounded to the hour so cached queries keep the same key for an hour. */
const hourIso = (ms: number) => new Date(Math.floor(ms / HOUR) * HOUR).toISOString();
const list = (values: string[]) => values.join(",");
const httpOnly = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);

async function listRecentResults(sports: string[] | null, clubIds: string[], tournamentIds: string[], since: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("tournaments");
  const supabase = createPublicClient();
  let q = supabase
    .from("tournaments")
    .select("id, short_code, name, sport_slug, starts_at, city, lat, lng, club_id, clubs (name), teams (count)")
    .eq("status", "finished")
    .gte("starts_at", since)
    .order("starts_at", { ascending: false })
    .limit(30);
  const or = [
    sports ? `sport_slug.in.(${list(sports)})` : null,
    clubIds.length ? `club_id.in.(${list(clubIds)})` : null,
    tournamentIds.length ? `id.in.(${list(tournamentIds)})` : null,
  ].filter(Boolean);
  if (sports) q = q.or(or.join(","));
  const { data } = await q;
  return data ?? [];
}

async function listFeedAnnouncements(sports: string[] | null, clubIds: string[]) {
  "use cache";
  cacheLife("minutes");
  cacheTag("announcements");
  const supabase = createPublicClient();
  let q = supabase
    .from("announcements")
    .select("id, title, body, link_url, published_at, sport_slug, club_id, clubs (name, slug, lat, lng)")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(30);
  if (sports) {
    const or = [`sport_slug.is.null`, `sport_slug.in.(${list(sports)})`];
    if (clubIds.length) or.push(`club_id.in.(${list(clubIds)})`);
    q = q.or(or.join(","));
  }
  const { data } = await q;
  return data ?? [];
}

async function listNewClubs(sports: string[] | null, since: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("clubs");
  const supabase = createPublicClient();
  let q = supabase
    .from("clubs")
    .select("id, slug, name, city, lat, lng, sports, logo_path, created_at, updated_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (sports) q = q.overlaps("sports", sports);
  const { data } = await q;
  return data ?? [];
}

async function listNews(sports: string[] | null) {
  "use cache";
  cacheLife("minutes");
  cacheTag("news");
  const supabase = createPublicClient();
  // Inner join: items of a disabled source (hidden by RLS) are left out.
  let q = supabase
    .from("news_items")
    .select("id, title, url, published_at, created_at, news_sources!inner (name, sport_slug)")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(30);
  if (sports) q = q.or(`sport_slug.is.null,sport_slug.in.(${list(sports)})`, { referencedTable: "news_sources" });
  const { data } = await q;
  return data ?? [];
}

/** Clubs and tournaments the person follows (their own rows, RLS). */
async function listFollows(viewer: Viewer | null): Promise<{ clubIds: string[]; tournamentIds: string[]; clubSlugs: Set<string> }> {
  if (!viewer) return { clubIds: [], tournamentIds: [], clubSlugs: new Set() };
  const supabase = await createClient();
  const { data } = await supabase.from("follows").select("club_id, tournament_id, clubs (slug)").eq("user_id", viewer.id);
  const ids = (key: "club_id" | "tournament_id") =>
    [...new Set((data ?? []).map((f) => f[key]).filter((v): v is string => typeof v === "string" && UUID.test(v)))].sort();
  const clubSlugs = new Set((data ?? []).flatMap((f) => (f.clubs?.slug ? [f.clubs.slug] : [])));
  return { clubIds: ids("club_id"), tournamentIds: ids("tournament_id"), clubSlugs };
}

export type FeedInput = {
  viewer: Viewer | null;
  /** The person's sports, or the sport selector (null = all sports). */
  sports: string[] | null;
  strictSports: boolean;
  where: { lat?: number | null; lng?: number | null } | null;
  radiusKm: number;
  prefs: FeedPrefs;
  nowMs: number;
};

/** The ranked feed of a person (or a guest, from the device preferences). */
export async function buildFeed(input: FeedInput): Promise<FeedItem[]> {
  const { viewer, prefs, nowMs } = input;
  const sports = input.sports?.filter((s) => SLUG.test(s)).sort() ?? null;
  const sportKey = sports && sports.length > 0 ? sports : null;
  // Sports switched off (football) never reach the feed, even with « all sports ».
  const offered = offeredSportSlugs();
  const queryKey = sportKey ?? offered;
  const origin = input.where?.lat != null && input.where.lng != null ? { lat: input.where.lat, lng: input.where.lng } : null;
  const dist = (p: { lat: number | null; lng: number | null } | null | undefined) =>
    origin && p?.lat != null && p.lng != null ? distanceKm(origin, { lat: p.lat, lng: p.lng }) : null;

  const follows = await listFollows(viewer);
  const followedClubs = new Set(follows.clubIds);
  const followedTournaments = new Set(follows.tournamentIds);
  const none = Promise.resolve([] as never[]);

  const [upcoming, results, announcements, clubs, news] = await Promise.all([
    prefs.nearby ? listUpcomingTournaments(queryKey, 30) : none,
    prefs.results ? listRecentResults(queryKey, follows.clubIds, follows.tournamentIds, hourIso(nowMs - 14 * DAY)) : none,
    prefs.clubs ? listFeedAnnouncements(queryKey, follows.clubIds) : none,
    prefs.nearby ? listNewClubs(queryKey, hourIso(nowMs - 30 * DAY)) : none,
    prefs.news ? listNews(queryKey) : none,
  ]);

  const items: FeedItem[] = [];
  const ownClubs = new Set(viewer?.clubs.map((c) => c.id) ?? []);

  for (const t of upcoming) {
    const d = dist(t);
    const closesMs = t.registration_closes_at ? Date.parse(t.registration_closes_at) : NaN;
    const closing = t.status === "published" && closesMs > nowMs && closesMs - nowMs < 3 * DAY;
    items.push({
      key: `t:${t.id}`,
      kind: closing ? "closing" : "upcoming",
      sport: t.sport_slug,
      at: t.starts_at,
      distanceKm: d,
      followed: followedTournaments.has(t.id) || (t.club != null && follows.clubSlugs.has(t.club.slug)),
      live: t.status === "live",
      tournament: d == null ? t : { ...t, distanceKm: d },
    });
  }

  for (const r of results) {
    if (!r.short_code) continue;
    items.push({
      key: `r:${r.id}`,
      kind: "result",
      sport: r.sport_slug,
      at: r.starts_at,
      distanceKm: dist(r),
      followed: followedTournaments.has(r.id) || followedClubs.has(r.club_id),
      result: {
        code: r.short_code,
        name: r.name,
        clubName: r.clubs?.name ?? null,
        city: r.city,
        startsAt: r.starts_at,
        teamCount: r.teams[0]?.count ?? 0,
      },
    });
  }

  for (const a of announcements) {
    items.push({
      key: `a:${a.id}`,
      kind: "announcement",
      sport: a.sport_slug,
      at: a.published_at,
      distanceKm: dist(a.clubs),
      followed: followedClubs.has(a.club_id),
      announcement: {
        title: a.title,
        body: a.body,
        linkUrl: httpOnly(a.link_url),
        clubName: a.clubs?.name ?? null,
        clubSlug: a.clubs?.slug ?? null,
        publishedAt: a.published_at,
      },
    });
  }

  for (const c of clubs) {
    if (ownClubs.has(c.id)) continue;
    items.push({
      key: `c:${c.id}`,
      kind: "newClub",
      sport: queryKey.find((s) => c.sports.includes(s)) ?? c.sports[0] ?? null,
      at: c.created_at,
      distanceKm: dist(c),
      followed: followedClubs.has(c.id),
      club: { name: c.name, slug: c.slug, city: c.city, logoUrl: clubLogoUrl(c.logo_path, c.updated_at) },
    });
  }

  for (const n of news) {
    const url = httpOnly(n.url);
    if (!url) continue;
    items.push({
      key: `n:${n.id}`,
      kind: "news",
      sport: n.news_sources.sport_slug,
      at: n.published_at ?? n.created_at,
      news: { title: n.title, url, source: n.news_sources.name, publishedAt: n.published_at ?? n.created_at },
    });
  }

  const shown = items.filter((i) => i.sport == null || offered.includes(i.sport));
  return rankFeed(shown, { nowMs, sports: sportKey, strictSports: input.strictSports, radiusKm: input.radiusKm, prefs });
}
