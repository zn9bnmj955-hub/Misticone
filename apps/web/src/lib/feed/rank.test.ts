import { describe, expect, it } from "vitest";
import { DEFAULT_FEED_PREFS, parseFeedPrefs, rankFeed, scoreItem, type RankContext, type Rankable } from "./rank";

const NOW = Date.parse("2026-10-13T10:00:00Z");
const day = (n: number) => new Date(NOW + n * 86_400_000).toISOString();
const ctx = (patch: Partial<RankContext> = {}): RankContext => ({
  nowMs: NOW,
  sports: ["petanque"],
  strictSports: false,
  radiusKm: 30,
  prefs: DEFAULT_FEED_PREFS,
  ...patch,
});
const item = (key: string, patch: Partial<Rankable> = {}): Rankable => ({ key, kind: "upcoming", sport: "petanque", at: day(3), ...patch });
const keys = (items: Rankable[]) => items.map((i) => i.key);

describe("rankFeed", () => {
  it("puts a tournament being played first, whatever the rest", () => {
    const out = rankFeed(
      [item("near", { distanceKm: 1, at: day(0.1) }), item("news", { kind: "news", at: day(0) }), item("live", { live: true, distanceKm: 28, at: day(-0.2) })],
      ctx(),
    );
    expect(out[0]!.key).toBe("live");
  });

  it("ranks closer tournaments first and penalizes those beyond the radius", () => {
    const out = rankFeed([item("far", { distanceKm: 80 }), item("mid", { distanceKm: 20 }), item("close", { distanceKm: 2 })], ctx());
    expect(keys(out)).toEqual(["close", "mid", "far"]);
    // Beyond the radius loses even against a later tournament inside it.
    expect(scoreItem(item("far", { distanceKm: 45, at: day(1) }), ctx())).toBeLessThan(scoreItem(item("in", { distanceKm: 25, at: day(12) }), ctx()));
  });

  it("orders upcoming sooner first, results and news newer first", () => {
    expect(keys(rankFeed([item("later", { at: day(20) }), item("soon", { at: day(1) })], ctx()))).toEqual(["soon", "later"]);
    const news = rankFeed([item("old", { kind: "news", at: day(-10) }), item("fresh", { kind: "news", at: day(-1) })], ctx());
    expect(keys(news)).toEqual(["fresh", "old"]);
    const results = rankFeed([item("r-old", { kind: "result", at: day(-12) }), item("r-new", { kind: "result", at: day(-2) })], ctx());
    expect(keys(results)).toEqual(["r-new", "r-old"]);
  });

  it("boosts followed clubs", () => {
    const out = rankFeed(
      [item("other", { kind: "announcement", at: day(-1), distanceKm: 5 }), item("mine", { kind: "announcement", at: day(-3), distanceKm: 25, followed: true })],
      ctx(),
    );
    expect(keys(out)).toEqual(["mine", "other"]);
  });

  it("prefers the person's sports and hides other sports unless followed", () => {
    const items = [item("foot", { sport: "football" }), item("foot-followed", { sport: "football", followed: true }), item("all", { kind: "news", sport: null })];
    expect(keys(rankFeed(items, ctx())).sort()).toEqual(["all", "foot-followed"]);
    // With the sport selector set, other sports disappear even when followed.
    expect(keys(rankFeed(items, ctx({ strictSports: true })))).toEqual(["all"]);
    // No sport chosen: everything stays.
    expect(rankFeed(items, ctx({ sports: null }))).toHaveLength(3);
  });

  it("respects the feed preferences", () => {
    const items = [
      item("u"),
      item("c", { kind: "closing" }),
      item("r", { kind: "result", at: day(-1) }),
      item("a", { kind: "announcement", at: day(-1) }),
      item("n", { kind: "news", at: day(-1) }),
      item("club", { kind: "newClub", at: day(-1) }),
    ];
    const prefs = { nearby: false, results: true, news: false, clubs: true };
    expect(keys(rankFeed(items, ctx({ prefs }))).sort()).toEqual(["a", "r"]);
  });

  it("caps each kind, removes duplicates and keeps a stable order", () => {
    const many = Array.from({ length: 10 }, (_, i) => item(`n${i}`, { kind: "news", at: day(-1) }));
    const out = rankFeed([...many, item("n0", { kind: "news", at: day(-1) })], ctx(), { caps: { news: 3 } });
    expect(keys(out)).toEqual(["n0", "n1", "n2"]);
    expect(rankFeed(many, ctx(), { limit: 2, caps: { news: 10 } })).toHaveLength(2);
  });
});

describe("parseFeedPrefs", () => {
  it("defaults every toggle to on and keeps valid booleans", () => {
    expect(parseFeedPrefs(null)).toEqual(DEFAULT_FEED_PREFS);
    expect(parseFeedPrefs({ news: false, results: "no" })).toEqual({ ...DEFAULT_FEED_PREFS, news: false });
  });
});
