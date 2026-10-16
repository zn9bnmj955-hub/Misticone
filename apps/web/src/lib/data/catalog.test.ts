import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({}) }));

const { catalogFiltersToQuery, parseCatalogFilters, toCatalogQuery, whenRange } = await import("./catalog");

describe("catalog filters", () => {
  it("round-trips through the URL", () => {
    const f = parseCatalogFilters({ sport: "petanque", quand: "weekend", rayon: "30", ouverture: "licencies", places: "1", vue: "carte", tri: "distance" }, null);
    expect(f).toMatchObject({ sport: "petanque", when: "weekend", radiusKm: 30, eligibility: "licensed", places: true, view: "map", sort: "distance" });
    expect(catalogFiltersToQuery(f)).toBe("?sport=petanque&quand=weekend&rayon=30&ouverture=licencies&places=1&vue=carte&tri=distance");
  });
  it("ignores unknown values and falls back to the sport selector", () => {
    const f = parseCatalogFilters({ rayon: "7", format: "nope", categorie: "x", lat: "abc" }, "petanque");
    expect(f).toMatchObject({ sport: "petanque", radiusKm: null, format: null, category: null, point: null });
  });
  it("brings a sport that is no longer offered (football) back to pétanque", () => {
    expect(parseCatalogFilters({}, "football").sport).toBe("petanque");
    expect(parseCatalogFilters({ sport: "football" }, null).sport).toBe("petanque");
  });
  it("« all sports » only lists the sports offered", () => {
    const f = parseCatalogFilters({}, "all");
    expect(f.sport).toBeNull();
    expect(toCatalogQuery(f, null, Date.now()).sports).toEqual(["petanque"]);
  });
  it("only filters by distance when a point is known", () => {
    const f = parseCatalogFilters({ rayon: "30", tri: "distance" }, null);
    expect(toCatalogQuery(f, null, Date.now()).radius_km).toBeUndefined();
    expect(toCatalogQuery(f, { lat: 43.3, lng: 5.5 }, Date.now())).toMatchObject({ radius_km: 30, sort: "distance" });
  });
});

describe("date windows (Paris time)", () => {
  it("weekend from a Wednesday covers Saturday and Sunday", () => {
    const r = whenRange("weekend", Date.parse("2026-10-14T10:00:00Z"));
    expect(r).toEqual({ from: "2026-10-16T22:00:00.000Z", to: "2026-10-18T22:00:00.000Z" });
  });
  it("today ends at midnight Paris time", () => {
    expect(whenRange("today", Date.parse("2026-10-14T10:00:00Z"))).toEqual({ from: "2026-10-13T22:00:00.000Z", to: "2026-10-14T22:00:00.000Z" });
  });
});
