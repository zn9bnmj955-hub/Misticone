import { requireSport } from "@orgasport/sports";
import { describe, expect, it } from "vitest";
import { defaultTournamentConfig, resolveConfig } from "./config";

const petanque = requireSport("petanque");
const football = requireSport("football");

/** Configs exactly as stored in tournaments.config before the B/C options (local demo base). */
const STORED_FORM_PETANQUE = {
  draw: { seeding: false, avoidSameClubFirstRound: true },
  pools: { size: 4, system: "gsl", qualifiers: 2 },
  format: "single_elimination",
  rounds: null,
  ranking: ["wins", "point_diff", "points_for", "head_to_head", "random"],
  referee: null,
  scoring: { timeLimitMinutes: null },
  autoDrawAt: null,
  scoreEntry: "table",
  bracketMode: "redraw",
  consolation: { enabled: true, losersOfRound: 1 },
  substitutes: 0,
  autoNextRound: true,
  communication: { notifications: true, reminderDayBefore: true },
  reservedVenuesFrom: "semifinal",
};
const STORED_FOOTBALL_POOLS = {
  draw: { seeding: false, avoidSameClubFirstRound: false },
  pools: { size: 4, system: "round_robin", qualifiers: 2 },
  format: "pools_then_bracket",
  rounds: null,
  ranking: ["match_points", "point_diff", "points_for", "head_to_head", "random"],
  autoDrawAt: "2026-10-16T04:29:01.022Z",
  scoreEntry: "table",
  bracketMode: "fixed",
  consolation: { enabled: false, losersOfRound: 1 },
  forfeitScore: { loser: 0, winner: 3 },
  autoNextRound: true,
  reservedVenuesFrom: "semifinal",
};

describe("tournament config already stored in the base (M1)", () => {
  it("a pétanque config written by the form (extra keys, legacy B) keeps every value and gets the new defaults", () => {
    const r = resolveConfig(STORED_FORM_PETANQUE, petanque);
    expect(r).toEqual({
      ...defaultTournamentConfig(petanque),
      format: "single_elimination",
      bracketMode: "redraw",
      autoNextRound: true,
    });
    expect(r.consolation).toEqual({ enabled: true, source: "losers_round_1", entry: "auto", feeCents: null, losersOfRound: 1 });
    expect(r.cadrage).toEqual({ afterRound: 1 });
    expect(r.byeScore).toEqual({ winner: 13, loser: 7 });
    expect(r.forfeitScore).toEqual({ winner: 13, loser: 0 });
  });

  it("a football pools config keeps its format, fixed tree and forfeit score; byes keep the forfeit score", () => {
    const r = resolveConfig(STORED_FOOTBALL_POOLS, football);
    expect(r.format).toBe("pools_then_bracket");
    expect(r.bracketMode).toBe("fixed");
    expect(r.autoDrawAt).toBe("2026-10-16T04:29:01.022Z");
    expect(r.pools).toEqual({ size: 4, system: "round_robin", qualifiers: 2 });
    expect(r.consolation).toMatchObject({ enabled: false, source: "pool_non_qualified", entry: "auto" });
    expect(r.consolationC.enabled).toBe(false);
    expect(r.pause).toBeNull();
    expect(r.byeScore).toEqual({ winner: 3, loser: 0 });
  });

  it("a resolved config stored back reads identically (pétanque and football, with every new option set)", () => {
    for (const sport of [petanque, football]) {
      const base = defaultTournamentConfig(sport);
      expect(resolveConfig(JSON.parse(JSON.stringify(base)), sport)).toEqual(base);
    }
    const custom = {
      ...defaultTournamentConfig(petanque),
      format: "pools_then_bracket" as const,
      cadrage: { afterRound: 2 as const },
      consolation: { enabled: true, source: "pool_non_qualified" as const, entry: "opt_in" as const, feeCents: 500, losersOfRound: 1 },
      consolationC: { enabled: true, entry: "opt_in" as const, feeCents: 300 },
      pause: { before: { remaining: 8 as const } },
      byeScore: { winner: 13, loser: 0 },
    };
    expect(resolveConfig(JSON.parse(JSON.stringify(custom)), petanque)).toEqual(custom);
  });
});
