import { requireSport } from "@orgasport/sports";
import { describe, expect, it } from "vitest";
import { defaultTournamentConfig, resolveConfig } from "./config";
import type { TournamentConfig } from "./types";

/** What the server stores in tournaments.config is the resolved config itself, as JSON. */
const stored = (c: TournamentConfig): unknown => JSON.parse(JSON.stringify(c));

describe("tournament config: a stored full config reads back unchanged", () => {
  it.each(["petanque", "football"])("%s defaults", (id) => {
    const sport = requireSport(id);
    const c = defaultTournamentConfig(sport);
    expect(resolveConfig(stored(c), sport)).toEqual(c);
  });

  it("every new option set at once (pools, cadrage k=2, B and C opt-in with fees, pause, own bye score)", () => {
    const sport = requireSport("petanque");
    const c: TournamentConfig = {
      ...defaultTournamentConfig(sport),
      format: "pools_then_bracket",
      cadrage: { afterRound: 2 },
      consolation: { enabled: true, source: "pool_non_qualified", entry: "opt_in", feeCents: 500, losersOfRound: 1 },
      consolationC: { enabled: true, entry: "opt_in", feeCents: 300 },
      pause: "afterPools",
      byeScore: { winner: 13, loser: 6 },
    };
    expect(resolveConfig(stored(c), sport)).toEqual(c);
    for (const pause of [{ before: { remaining: 8 } }, { afterRound: 2 }, null] as const) {
      expect(resolveConfig(stored({ ...c, pause }), sport).pause).toEqual(pause);
    }
  });

  it("a legacy B setting still reads (football, pools by default: the B takes the non-qualifiers; bye follows the stored forfeit score)", () => {
    const sport = requireSport("football");
    const r = resolveConfig({ consolation: { enabled: true, losersOfRound: 2 }, forfeitScore: { winner: 3, loser: 0 } }, sport);
    expect(r.consolation).toEqual({ enabled: true, source: "pool_non_qualified", entry: "auto", feeCents: null, losersOfRound: 2 });
    expect(r.byeScore).toEqual({ winner: 3, loser: 0 });
  });
});
