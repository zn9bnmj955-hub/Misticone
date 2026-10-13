/**
 * Ranking of the personalized home feed. Pure: the caller passes the current
 * time, the person's sports, radius and feed preferences; the same inputs
 * always give the same order (ties broken by key).
 *
 * Higher score = higher in the feed. A tournament being played is always on
 * top when it is near or followed (the person's own live match is pinned
 * above the feed by the page).
 */

export type FeedKind = "upcoming" | "closing" | "result" | "announcement" | "newClub" | "news";

/** `profiles.feed_prefs` toggles (every one on by default, guests included). */
export type FeedPrefs = { nearby: boolean; results: boolean; news: boolean; clubs: boolean };
export const DEFAULT_FEED_PREFS: FeedPrefs = { nearby: true, results: true, news: true, clubs: true };

export function parseFeedPrefs(raw: unknown): FeedPrefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const flag = (k: keyof FeedPrefs) => (typeof o[k] === "boolean" ? (o[k] as boolean) : DEFAULT_FEED_PREFS[k]);
  return { nearby: flag("nearby"), results: flag("results"), news: flag("news"), clubs: flag("clubs") };
}

/** Which preference shows each kind of item. */
const PREF_OF_KIND: Record<FeedKind, keyof FeedPrefs> = {
  upcoming: "nearby",
  closing: "nearby",
  newClub: "nearby",
  result: "results",
  announcement: "clubs",
  news: "news",
};

export function kindEnabled(kind: FeedKind, prefs: FeedPrefs): boolean {
  return prefs[PREF_OF_KIND[kind]];
}

export type Rankable = {
  key: string;
  kind: FeedKind;
  /** Sport of the item; null = every sport (a general news source, an announcement without sport). */
  sport: string | null;
  /** The date that matters: start (upcoming), start (result), publication (news, announcement), creation (club). */
  at: string | null;
  distanceKm?: number | null;
  /** The person follows the club (or the tournament). */
  followed?: boolean;
  /** A tournament being played right now. */
  live?: boolean;
};

export type RankContext = {
  nowMs: number;
  /** The person's sports (null = all sports). */
  sports: string[] | null;
  /** True when the sport selector is set: other sports are hidden, even for followed clubs. */
  strictSports: boolean;
  radiusKm: number;
  prefs: FeedPrefs;
};

export const DEFAULT_CAPS: Record<FeedKind, number> = { upcoming: 8, closing: 3, result: 4, announcement: 4, newClub: 3, news: 5 };
export const DEFAULT_LIMIT = 24;

const DAY = 24 * 60 * 60 * 1000;
const KIND_BASE: Record<FeedKind, number> = { closing: 20, upcoming: 10, result: 6, announcement: 6, newClub: 0, news: 0 };

/** Upcoming kinds look forward (sooner first); the others look back (newer first). */
const FORWARD: ReadonlySet<FeedKind> = new Set(["upcoming", "closing"]);

export function scoreItem(item: Rankable, ctx: RankContext): number {
  let s = KIND_BASE[item.kind];
  // A tournament being played nearby (or followed) goes on top; a far one only gets a small boost.
  if (item.live) {
    const near = item.distanceKm == null || item.distanceKm <= ctx.radiusKm;
    s += item.followed || near ? 1000 : 30;
  }
  if (item.followed) s += 60;

  if (ctx.sports && ctx.sports.length > 0) {
    if (item.sport == null) s += 15;
    else s += ctx.sports.includes(item.sport) ? 30 : -80;
  }

  if (item.distanceKm != null && ctx.radiusKm > 0) {
    const d = Math.max(0, item.distanceKm);
    if (d <= ctx.radiusKm) s += 40 * (1 - d / ctx.radiusKm);
    else s -= 50 + Math.min(50, ((d - ctx.radiusKm) / ctx.radiusKm) * 25);
  }

  if (item.at) {
    const t = Date.parse(item.at);
    if (!Number.isNaN(t)) {
      const days = FORWARD.has(item.kind) ? Math.max(0, (t - ctx.nowMs) / DAY) : Math.max(0, (ctx.nowMs - t) / DAY);
      s += 40 * Math.exp(-days / (FORWARD.has(item.kind) ? 10 : 7));
    }
  }
  return s;
}

/** Hidden by the preferences, or by the sport filter. */
export function isVisible(item: Rankable, ctx: RankContext): boolean {
  if (!kindEnabled(item.kind, ctx.prefs)) return false;
  if (item.sport != null && ctx.sports && ctx.sports.length > 0 && !ctx.sports.includes(item.sport)) {
    // Another sport: only a followed club or tournament may stay, and never with the sport selector set.
    return !ctx.strictSports && Boolean(item.followed);
  }
  return true;
}

/**
 * Visible items, best first, with at most `caps[kind]` items of each kind so
 * one source (many news, many tournaments) never fills the whole feed.
 */
export function rankFeed<T extends Rankable>(
  items: T[],
  ctx: RankContext,
  opts: { limit?: number; caps?: Partial<Record<FeedKind, number>> } = {},
): T[] {
  const caps = { ...DEFAULT_CAPS, ...opts.caps };
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const seen = new Set<string>();
  const scored = items
    .filter((i) => isVisible(i, ctx))
    .filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)))
    .map((item) => ({ item, score: scoreItem(item, ctx) }))
    .sort((a, b) => b.score - a.score || (a.item.key < b.item.key ? -1 : a.item.key > b.item.key ? 1 : 0));

  const counts: Partial<Record<FeedKind, number>> = {};
  const out: T[] = [];
  for (const { item } of scored) {
    if (out.length >= limit) break;
    const n = counts[item.kind] ?? 0;
    if (n >= caps[item.kind]) continue;
    counts[item.kind] = n + 1;
    out.push(item);
  }
  return out;
}
