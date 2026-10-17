import { beforeEach, describe, expect, it } from "vitest";
import { matchesOfRound, roundsOf, teamsInRound } from "./queries";
import { exec, makeState, playToEnd, resetOps, type TestConfig } from "./test-helpers";

/** Lot 2, M4: B in « opt_in », C in « auto » — the C follows the B on its own, from the B's 1st-game losers only. */

beforeEach(() => resetOps());

const MIXED: TestConfig = {
  bracketMode: "redraw",
  cadrage: { afterRound: 1 },
  consolation: { enabled: true, entry: "opt_in" },
  consolationC: { enabled: true, entry: "auto" },
};

describe("B opt_in, C auto", () => {
  it("5 entered in the B (2 games + 1 exempt): the C is drawn automatically with the 2 losers, never the B's exempt, and the tournament ends", () => {
    let s = exec(makeState({ teams: 13, config: MIXED }), { type: "round.draw", bracket: "main", seed: "a" });
    const a1 = roundsOf(s, "main")[0]!;
    for (const m of matchesOfRound(s, a1.id)) if (m.status !== "bye") s = exec(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 4 });
    const aLosers = matchesOfRound(s, a1.id).filter((m) => m.status !== "bye").map((m) => m.sideB[0]!);
    expect(aLosers).toHaveLength(6);
    for (const id of aLosers.slice(0, 5)) s = exec(s, { type: "team.enterBracket", teamId: id, bracket: "consolation", enter: true });
    // The B waits for the table.
    expect(roundsOf(s, "consolation")).toHaveLength(0);
    s = exec(s, { type: "round.draw", bracket: "consolation", seed: "b" });
    const b1 = roundsOf(s, "consolation")[0]!;
    expect(teamsInRound(s, b1)).toBe(5);
    const b1Matches = matchesOfRound(s, b1.id);
    const bExempt = b1Matches.filter((m) => m.status === "bye").flatMap((m) => [...m.sideA, ...m.sideB]);
    expect(bExempt).toHaveLength(1);
    expect(roundsOf(s, "consolation_c")).toHaveLength(0);
    for (const m of b1Matches) if (m.status !== "bye") s = exec(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 6 });
    const bLosers = b1Matches.filter((m) => m.status !== "bye").map((m) => m.sideB[0]!);
    // No entry needed: the C (auto) is drawn as soon as the B's 1st game is complete.
    const c1 = roundsOf(s, "consolation_c")[0];
    expect(c1).toBeDefined();
    const cTeams = matchesOfRound(s, c1!.id).flatMap((m) => [...m.sideA, ...m.sideB]);
    expect(new Set(cTeams)).toEqual(new Set(bLosers));
    expect(cTeams).not.toContain(bExempt[0]);
    const end = playToEnd(s, "mixed");
    expect(end.tournament.status).toBe("finished");
  });
});
