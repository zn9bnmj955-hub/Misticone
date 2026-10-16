import { requireSport } from "@orgasport/sports";
import { describe, expect, it } from "vitest";
import { defaultTournamentConfig, resolveConfig } from "./config";

const petanque = requireSport("petanque");
const football = requireSport("football");

describe("tournament config: cadrage, B/C, pause, bye score", () => {
  it("pétanque defaults: new draw each round, cadrage after the 1st game, automatic B, no C, bye 13-7", () => {
    const c = defaultTournamentConfig(petanque);
    expect(c.bracketMode).toBe("redraw");
    expect(c.cadrage).toEqual({ afterRound: 1 });
    expect(c.consolation).toEqual({ enabled: true, source: "losers_round_1", entry: "auto", feeCents: null, losersOfRound: 1 });
    expect(c.consolationC).toEqual({ enabled: false, entry: "auto", feeCents: null });
    expect(c.pause).toBeNull();
    expect(c.forfeitScore).toEqual({ winner: 13, loser: 0 });
    expect(c.byeScore).toEqual({ winner: 13, loser: 7 });
  });

  it("football keeps its behaviour: fixed tree, no B, bye = forfeit score", () => {
    const c = defaultTournamentConfig(football);
    expect(c.bracketMode).toBe("fixed");
    expect(c.consolation.enabled).toBe(false);
    expect(c.consolationC.enabled).toBe(false);
    expect(c.byeScore).toEqual(c.forfeitScore);
    // A stored forfeit score still applies to byes when the sport has no bye score.
    expect(resolveConfig({ forfeitScore: { winner: 5, loser: 0 } }, football).byeScore).toEqual({ winner: 5, loser: 0 });
  });

  it("reads a config stored before the B/C options as the equivalent new config", () => {
    const legacy = { format: "single_elimination", bracketMode: "redraw", consolation: { enabled: true, losersOfRound: 1 } };
    const r = resolveConfig(legacy, petanque);
    expect(r).toEqual({ ...defaultTournamentConfig(petanque), format: "single_elimination", bracketMode: "redraw" });
    expect(r.consolation).toEqual({ enabled: true, source: "losers_round_1", entry: "auto", feeCents: null, losersOfRound: 1 });

    const legacyOff = resolveConfig({ consolation: { enabled: false, losersOfRound: 2 } }, petanque);
    expect(legacyOff.consolation).toMatchObject({ enabled: false, losersOfRound: 2, source: "losers_round_1", entry: "auto" });

    // With pools, the B takes the pool non-qualifiers.
    const pools = resolveConfig({ format: "pools_then_bracket", consolation: { enabled: true, losersOfRound: 1 } }, petanque);
    expect(pools.consolation.source).toBe("pool_non_qualified");
  });

  it("reads the new options", () => {
    const r = resolveConfig(
      {
        cadrage: { afterRound: 2 },
        consolation: { enabled: true, source: "losers_round_1", entry: "opt_in", feeCents: 500 },
        consolationC: { enabled: true, entry: "opt_in", feeCents: 300 },
        pause: { before: { remaining: 16 } },
        byeScore: { winner: 13, loser: 0 },
      },
      petanque,
    );
    expect(r.cadrage).toEqual({ afterRound: 2 });
    expect(r.consolation).toMatchObject({ entry: "opt_in", feeCents: 500, losersOfRound: 1 });
    expect(r.consolationC).toEqual({ enabled: true, entry: "opt_in", feeCents: 300 });
    expect(r.pause).toEqual({ before: { remaining: 16 } });
    expect(r.byeScore).toEqual({ winner: 13, loser: 0 });
    expect(resolveConfig({ pause: "afterPools" }, petanque).pause).toBe("afterPools");
    expect(resolveConfig({ pause: { afterRound: 3 } }, petanque).pause).toEqual({ afterRound: 3 });
  });

  it("falls back to the defaults on invalid values", () => {
    const base = defaultTournamentConfig(petanque);
    expect(resolveConfig({ cadrage: { afterRound: 3 } }, petanque)).toEqual(base);
    expect(resolveConfig({ pause: { before: { remaining: 12 } } }, petanque)).toEqual(base);
    expect(resolveConfig(null, petanque)).toEqual(base);
  });
});
