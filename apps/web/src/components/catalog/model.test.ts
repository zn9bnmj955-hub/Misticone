import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({}) }));

const { parseCatalogFilters } = await import("@/lib/data/catalog");
const model = await import("./model");
type Row = import("./model").CatalogCardRow;

const NOW = Date.parse("2026-10-12T10:00:00Z");

function row(patch: Partial<Row> = {}): Row {
  return {
    id: "t1",
    short_code: "GP3M",
    name: "Grand Prix de la ville",
    status: "published",
    sport_slug: "petanque",
    starts_at: "2026-10-24T12:30:00Z",
    registration_closes_at: "2026-10-24T11:30:00Z",
    address: null,
    city: "Aubagne",
    postcode: "13400",
    lat: 43.29,
    lng: 5.57,
    team_format: "doublette",
    category: "all",
    eligibility: "open",
    registration_mode: "both",
    max_teams: 64,
    fee_cents: 1000,
    fee_per: "team",
    prize_text: null,
    format: "single_elimination",
    club_name: "Boule Aubagnaise",
    club_slug: "boule-aubagnaise",
    active_teams: 23,
    waitlist_teams: 0,
    distance_km: null,
    ...patch,
  };
}

describe("filter options", () => {
  it("offers only the formats and categories of the selected sport", () => {
    const petanque = model.formatOptions("petanque");
    expect(petanque).toContain("melee_rotation");
    expect(model.formatOptions(null)).toEqual(petanque);
    expect(model.categoryOptions("petanque")).not.toContain("all");
  });
  it("ignores a sport that is not offered (football switched off)", () => {
    expect(model.formatOptions("football")).toEqual(model.formatOptions(null));
  });
  it("keeps the current value even if the sport does not offer it", () => {
    expect(model.formatOptions("petanque", "round_robin")).toContain("round_robin");
  });
  it("falls back to every sport for an unknown sport", () => {
    expect(model.formatOptions("curling")).toEqual(model.formatOptions(null));
  });
});

describe("active filters", () => {
  const f = parseCatalogFilters({ quand: "weekend", rayon: "30", format: "swiss", ouverture: "licencies", places: "1", tri: "distance", vue: "carte" }, "petanque");

  it("lists one removable chip per filter, without the sport (SportBar)", () => {
    const chips = model.activeChips(f);
    expect(chips.map((c) => c.key)).toEqual(["when", "radius", "format", "eligibility", "places", "sort"]);
    const when = chips.find((c) => c.key === "when")!;
    expect(when.label).toBe("Ce week-end");
    expect(when.href).toBe("/concours?rayon=30&format=swiss&ouverture=licencies&places=1&vue=carte&tri=distance");
    expect(chips.every((c) => !c.href.includes("sport="))).toBe(true);
    expect(model.panelFilterCount(f)).toBe(5);
  });

  it("clears everything but keeps the view", () => {
    expect(model.clearAllHref(f)).toBe("/concours?vue=carte");
    expect(model.clearAllHref({ ...f, view: "list" })).toBe("/concours");
  });

  it("drops distance filters without a starting point", () => {
    const e = model.effectiveFilters(f, false);
    expect(e.radiusKm).toBeNull();
    expect(e.sort).toBe("date");
    expect(model.effectiveFilters(f, true)).toBe(f);
  });

  it("widens the radius step by step", () => {
    expect(model.widerRadius(30)).toBe(50);
    expect(model.widerRadius(200)).toBeNull();
    expect(model.widerRadius(null)).toBeNull();
  });

  it("pages keep the filters", () => {
    expect(model.pageHref({ ...f, view: "list" }, 2)).toBe("/concours?quand=weekend&rayon=30&format=swiss&ouverture=licencies&places=1&tri=distance&page=2");
    expect(model.parsePage("3", 4)).toBe(3);
    expect(model.parsePage("99", 4)).toBe(4);
    expect(model.parsePage("abc", 4)).toBe(1);
    expect(model.parsePage(undefined, 4)).toBe(1);
  });

  it("counts results", () => {
    expect(model.countLabel(0, false)).toBe("Aucun concours");
    expect(model.countLabel(1, false)).toBe("1 concours");
    expect(model.countLabel(12, false)).toBe("12 concours");
    expect(model.countLabel(50, true)).toBe("Plus de 50 concours");
  });
});

describe("card", () => {
  it("shows places left and the registration shortcut while open", () => {
    const c = model.toCardModel(row(), NOW);
    expect(c.window).toBe("open");
    expect(model.placesInfo(c)).toEqual({ text: "23 / 64 équipes · 41 places", fill: 23 / 64, full: false });
    expect(model.cardAction(c)).toEqual({ href: "/c/GP3M/inscription", label: "S'inscrire", kind: "register" });
    expect(model.statusBadge(c).tone).toBe("accent");
    expect(model.placesInfo(model.toCardModel(row({ active_teams: 63 }), NOW)).text).toBe("63 / 64 équipes · 1 place");
  });

  it("full with a waiting list", () => {
    const c = model.toCardModel(row({ active_teams: 64, waitlist_teams: 3, waitlist_enabled: true }), NOW);
    expect(c.window).toBe("waitlist");
    expect(model.placesInfo(c)).toEqual({ text: "Complet · liste d'attente · 3 en attente", fill: 1, full: true });
    expect(model.cardAction(c)?.label).toBe("Liste d'attente");
  });

  it("full without a waiting list: no shortcut", () => {
    const c = model.toCardModel(row({ active_teams: 64, waitlist_enabled: false }), NOW);
    expect(c.window).toBe("full");
    expect(model.placesInfo(c).text).toBe("Complet");
    expect(model.cardAction(c)).toBeNull();
  });

  it("closed, on-site only and live tournaments", () => {
    expect(model.cardAction(model.toCardModel(row({ registration_closes_at: "2026-10-01T00:00:00Z" }), NOW))).toBeNull();
    const onsite = model.toCardModel(row({ registration_mode: "onsite" }), NOW);
    expect(onsite.window).toBe("onsite_only");
    expect(model.statusBadge(onsite).label).toBe("Inscriptions sur place");
    const live = model.toCardModel(row({ status: "live", active_teams: 32, max_teams: 32 }), NOW);
    expect(model.cardAction(live)).toEqual({ href: "/c/GP3M", label: "Suivre en direct", kind: "live" });
    expect(model.placesInfo(live).text).toBe("32 / 32 équipes");
    expect(model.statusBadge(live).tone).toBe("live");
  });

  it("no limit of teams", () => {
    expect(model.placesInfo(model.toCardModel(row({ max_teams: null }), NOW))).toEqual({ text: "23 équipes inscrites", fill: null, full: false });
  });

  it("accepts the home feed shape (no registration state)", () => {
    const c = model.toCardModel({
      id: "t2",
      short_code: "TR8E",
      name: "Concours de l'été",
      status: "published",
      sport_slug: "petanque",
      starts_at: "2026-10-24T12:30:00Z",
      registration_closes_at: null,
      city: "Aubagne",
      lat: null,
      lng: null,
      team_format: "triplette",
      max_teams: 16,
      fee_cents: 0,
      fee_per: "team",
      prize_text: null,
      eligibility: "licensed",
      club: { name: "Club", slug: "club" },
      teamCount: 4,
      distanceKm: 12.4,
    });
    expect(c).toMatchObject({ window: null, activeTeams: 4, clubName: "Club", distanceKm: 12.4, competitionFormat: null });
    expect(model.cardAction(c)).toBeNull();
    expect(model.statusBadge(c).label).toBe("Inscriptions ouvertes");
  });

  it("formats the date the French way", () => {
    expect(model.whenLabel("2026-10-24T12:30:00Z")).toBe("sam. 24 oct. · 14 h 30");
  });
});

describe("map", () => {
  it("groups tournaments held at the same place and lists the others apart", () => {
    const rows = [
      row({ id: "a", short_code: "AAAA" }),
      row({ id: "b", short_code: "BBBB", lat: 43.29001, lng: 5.57001 }),
      row({ id: "c", short_code: "CCCC", sport_slug: "football", lat: 45.76, lng: 4.84, city: "Lyon" }),
      row({ id: "d", short_code: "DDDD", lat: null, lng: null }),
    ];
    const { points, withoutPosition } = model.mapPoints(rows);
    expect(withoutPosition.map((r) => r.id)).toEqual(["d"]);
    expect(points).toHaveLength(2);
    expect(points[0]!.items.map((i) => i.code)).toEqual(["AAAA", "BBBB"]);
    expect(points[0]!.items[0]).toMatchObject({ href: "/concours/AAAA", when: "sam. 24 oct. · 14 h 30 · Aubagne" });
    expect(points[0]!.accentToken).toBe("petanque");
    expect(points[1]!.accentToken).toBe("football");
  });
});
