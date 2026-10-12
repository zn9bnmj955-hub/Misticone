import { describe, expect, it } from "vitest";
import {
  aggregateClubStats,
  canEditMember,
  countTeams,
  groupClubTournaments,
  lastTwelveMonths,
  maskEmail,
  monthKey,
  normalizeLink,
  type StatsTournament,
} from "./model";

const team = (status: StatsTournament["teams"][number]["status"], players = 2) => ({ status, players });

describe("countTeams", () => {
  it("keeps the waiting list and withdrawals out of the places", () => {
    expect(countTeams([{ status: "registered" }, { status: "checked_in" }, { status: "forfeit" }, { status: "waitlist" }, { status: "withdrawn" }])).toEqual({
      active: 3,
      waitlist: 1,
    });
  });
});

describe("groupClubTournaments", () => {
  it("orders live first, drafts by last edit, past by most recent", () => {
    const rows = [
      { id: "pub-late", status: "published" as const, starts_at: "2026-11-20T13:00:00Z" },
      { id: "pub-soon", status: "published" as const, starts_at: "2026-10-20T13:00:00Z" },
      { id: "live", status: "live" as const, starts_at: "2026-10-12T13:00:00Z" },
      { id: "draft-old", status: "draft" as const, starts_at: null, updated_at: "2026-10-01T10:00:00Z" },
      { id: "draft-new", status: "draft" as const, starts_at: null, updated_at: "2026-10-10T10:00:00Z" },
      { id: "past-old", status: "finished" as const, starts_at: "2026-06-01T13:00:00Z" },
      { id: "past-new", status: "archived" as const, starts_at: "2026-09-01T13:00:00Z" },
    ];
    const g = groupClubTournaments(rows);
    expect(g.current.map((r) => r.id)).toEqual(["live", "pub-soon", "pub-late"]);
    expect(g.drafts.map((r) => r.id)).toEqual(["draft-new", "draft-old"]);
    expect(g.past.map((r) => r.id)).toEqual(["past-new", "past-old"]);
  });
});

describe("months", () => {
  it("uses Paris time", () => {
    // 31 Oct 23:30 UTC is already 1 November in Paris.
    expect(monthKey(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
  });
  it("lists the last twelve months across a year boundary", () => {
    const keys = lastTwelveMonths(new Date("2026-03-15T12:00:00Z"));
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe("2025-04");
    expect(keys[9]).toBe("2026-01");
    expect(keys[11]).toBe("2026-03");
  });
});

describe("aggregateClubStats", () => {
  const now = new Date("2026-10-12T10:00:00Z");
  const rows: StatsTournament[] = [
    {
      status: "live",
      sport_slug: "petanque",
      starts_at: "2026-10-12T12:00:00Z",
      max_teams: 4,
      fee_cents: 1000,
      fee_per: "team",
      teams: [team("checked_in"), team("checked_in"), team("forfeit"), team("waitlist"), team("withdrawn")],
    },
    {
      status: "finished",
      sport_slug: "petanque",
      starts_at: "2026-08-01T12:00:00Z",
      max_teams: 2,
      fee_cents: 500,
      fee_per: "player",
      teams: [team("registered", 3), team("registered", 3), team("registered", 3)],
    },
    { status: "published", sport_slug: "football", starts_at: "2027-01-10T12:00:00Z", max_teams: null, fee_cents: 0, fee_per: "team", teams: [team("registered", 7)] },
    { status: "draft", sport_slug: "football", starts_at: null, max_teams: 8, fee_cents: 5000, fee_per: "team", teams: [team("registered", 7)] },
    { status: "finished", sport_slug: "petanque", starts_at: "2024-05-01T12:00:00Z", max_teams: 10, fee_cents: 0, fee_per: "team", teams: [] },
  ];
  const s = aggregateClubStats(rows, now);

  it("counts every tournament per status and sport", () => {
    expect(s.total).toBe(5);
    expect(s.byStatus).toEqual([
      { status: "live", count: 1 },
      { status: "published", count: 1 },
      { status: "draft", count: 1 },
      { status: "finished", count: 2 },
    ]);
    expect(s.bySport).toEqual([
      { slug: "petanque", count: 3 },
      { slug: "football", count: 2 },
    ]);
  });

  it("counts registrations of published tournaments only", () => {
    expect(s.published).toBe(4);
    expect(s.teams).toBe(3 + 3 + 1);
    expect(s.players).toBe(6 + 9 + 7);
    expect(s.waitlist).toBe(1);
  });

  it("averages the fill rate, capped at 100 %", () => {
    // 3/4, then 3/2 capped to 1, then 0/10 (the tournament without maximum is ignored).
    expect(s.fillRate).toBeCloseTo((0.75 + 1 + 0) / 3);
  });

  it("computes expected entry fees per team or per player", () => {
    expect(s.expectedFeesCents).toBe(1000 * 3 + 500 * 9);
  });

  it("spreads tournaments over the last twelve months", () => {
    expect(s.months).toHaveLength(12);
    expect(s.months.at(-1)).toEqual({ key: "2026-10", tournaments: 1, teams: 3 });
    expect(s.months.find((m) => m.key === "2026-08")).toEqual({ key: "2026-08", tournaments: 1, teams: 3 });
    // Future and older tournaments stay out of the chart.
    expect(s.months.reduce((n, m) => n + m.tournaments, 0)).toBe(2);
  });

  it("has no fill rate without any maximum", () => {
    expect(aggregateClubStats([], now)).toMatchObject({ total: 0, fillRate: null, expectedFeesCents: 0 });
  });
});

describe("rules", () => {
  it("never lets an admin edit the owner or themselves", () => {
    const admin = { id: "a", role: "admin" as const };
    expect(canEditMember(admin, { userId: "b", role: "member" })).toBe(true);
    expect(canEditMember(admin, { userId: "c", role: "admin" })).toBe(true);
    expect(canEditMember(admin, { userId: "o", role: "owner" })).toBe(false);
    expect(canEditMember(admin, { userId: "a", role: "admin" })).toBe(false);
    expect(canEditMember({ id: "m", role: "member" }, { userId: "b", role: "member" })).toBe(false);
  });

  it("masks emails", () => {
    expect(maskEmail("sandrine@club.fr")).toBe("s••••••@club.fr");
    expect(maskEmail("ab@x.fr")).toBe("a••@x.fr");
    expect(maskEmail("nope")).toBe("•••");
  });

  it("accepts only http(s) links", () => {
    expect(normalizeLink("")).toBeNull();
    expect(normalizeLink(" https://club.fr/agenda ")).toBe("https://club.fr/agenda");
    expect(normalizeLink("javascript:alert(1)")).toBe("invalid");
    expect(normalizeLink("club.fr")).toBe("invalid");
  });
});
