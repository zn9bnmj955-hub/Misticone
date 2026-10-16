import { beforeEach, describe, expect, it } from "vitest";
import { compareRounds } from "./bracket";
import { bracketStartCount, canDrawNext, consolationEntrants } from "./formats";
import { isOfficeBye, matchesOfRound, roundsOf, teamsInRound } from "./queries";
import { exec, makeState, playToEnd, resetOps, type TestConfig } from "./test-helpers";
import type { Bracket, EngineState } from "./types";

/** Lot 2, M4: concours B and C (origin, own cadrage, C only from a B of 4 teams or more). */

beforeEach(() => resetOps());

/** One line per round of a bracket: teams in, games, exempt, « d'office ». */
function profile(s: EngineState, bracket: Bracket): string[] {
  return roundsOf(s, bracket, "elimination").map((r) => {
    const ms = matchesOfRound(s, r.id);
    const office = ms.filter((m) => isOfficeBye(s, m)).length;
    const exempt = ms.filter((m) => m.status === "bye").length - office;
    return `${teamsInRound(s, r)}:${ms.length - office - exempt}p${exempt ? `+${exempt}ex` : ""}${office ? `+${office}off` : ""}`;
  });
}

const BC: TestConfig = { bracketMode: "redraw", cadrage: { afterRound: 1 }, consolation: { enabled: true, entry: "auto" }, consolationC: { enabled: true, entry: "auto" } };

function play(n: number, config: TestConfig = BC): EngineState {
  return playToEnd(makeState({ teams: n, config }), `bc-${n}`);
}

describe("concours B and C", () => {
  it("13 teams: B = 6 (1st game, cadrage 1 + 1 d'office, final), C = 3 (1 game + 1 exempt, final)", () => {
    const s = play(13);
    expect(s.tournament.status).toBe("finished");
    expect(profile(s, "main")).toEqual(["13:6p+1ex", "7:3p+1off", "4:2p", "2:1p"]);
    expect(profile(s, "consolation")).toEqual(["6:3p", "3:1p+1off", "2:1p"]);
    expect(profile(s, "consolation_c")).toEqual(["3:1p+1ex", "2:1p"]);
  });

  it("the B takes the losers of the A's 1st game, never its exempt; the C the losers of the B's 1st game", () => {
    const s = play(13);
    const [a1] = roundsOf(s, "main", "elimination");
    const [b1] = roundsOf(s, "consolation", "elimination");
    const [c1] = roundsOf(s, "consolation_c", "elimination");
    const teams = (id: string) => new Set(matchesOfRound(s, id).flatMap((m) => [...m.sideA, ...m.sideB]));
    const exempt = matchesOfRound(s, a1!.id).find((m) => m.status === "bye")!.sideA[0]!;
    const aLosers = matchesOfRound(s, a1!.id).filter((m) => m.status !== "bye").map((m) => (m.winner === "A" ? m.sideB[0] : m.sideA[0]));
    expect(teams(b1!.id)).toEqual(new Set(aLosers));
    expect(teams(b1!.id).has(exempt)).toBe(false);
    const bLosers = matchesOfRound(s, b1!.id).map((m) => (m.winner === "A" ? m.sideB[0] : m.sideA[0]));
    expect(teams(c1!.id)).toEqual(new Set(bLosers));
  });

  it("33 teams: B = 16, C = 8, both without cadrage", () => {
    const s = play(33);
    expect(s.tournament.status).toBe("finished");
    expect(profile(s, "consolation")).toEqual(["16:8p", "8:4p", "4:2p", "2:1p"]);
    expect(profile(s, "consolation_c")).toEqual(["8:4p", "4:2p", "2:1p"]);
  });

  it("100 teams: B = 50, then 25, cadrage 9 games and 7 d'office, 16 left; C = 25, 13 left, cadrage 5 + 3, 8 left", () => {
    const s = play(100);
    expect(s.tournament.status).toBe("finished");
    expect(profile(s, "consolation").slice(0, 3)).toEqual(["50:25p", "25:9p+7off", "16:8p"]);
    expect(profile(s, "consolation_c").slice(0, 3)).toEqual(["25:12p+1ex", "13:5p+3off", "8:4p"]);
  });

  it("5 teams: the B has 2 teams, so the C is not drawn and the tournament ends", () => {
    const s = play(5);
    expect(profile(s, "consolation")).toEqual(["2:1p"]);
    expect(bracketStartCount(s, "consolation")).toBe(2);
    expect(roundsOf(s, "consolation_c")).toHaveLength(0);
    expect(canDrawNext(s, "consolation_c")).toBe(false);
    expect(() => exec(s, { type: "round.draw", bracket: "consolation_c", seed: "x" })).toThrow();
    expect(s.tournament.status).toBe("finished");
  });

  it("the C is never drawn when it is not enabled, nor without the B", () => {
    expect(roundsOf(play(13, { ...BC, consolationC: { enabled: false } }), "consolation_c")).toHaveLength(0);
    const noB = play(13, { ...BC, consolation: { enabled: false } });
    expect(roundsOf(noB, "consolation")).toHaveLength(0);
    expect(roundsOf(noB, "consolation_c")).toHaveLength(0);
    expect(noB.tournament.status).toBe("finished");
  });

  it("with pools, the B takes the non-qualified teams and its 1st game is a full draw; the C follows", () => {
    const s = playToEnd(makeState({ teams: 16, config: { ...BC, format: "pools_then_bracket" } }), "pools-bc");
    expect(s.tournament.status).toBe("finished");
    expect(profile(s, "consolation")).toEqual(["8:4p", "4:2p", "2:1p"]);
    expect(profile(s, "consolation_c")).toEqual(["4:2p", "2:1p"]);
  });

  it("the C's rounds come after the B's (a correction in the B's 1st game reaches the C)", () => {
    const s = play(13);
    const [b1] = roundsOf(s, "consolation", "elimination");
    const [c1] = roundsOf(s, "consolation_c", "elimination");
    expect(compareRounds(c1!, b1!)).toBeGreaterThan(0);
  });

  it("a team that withdrew before the B's draw is not drawn in it", () => {
    let s = makeState({ teams: 8, config: { ...BC, autoNextRound: false } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "a" });
    for (const m of matchesOfRound(s, roundsOf(s, "main")[0]!.id)) {
      s = exec(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 5 });
      if (m.position === 1) s = exec(s, { type: "team.setStatus", teamId: m.sideB[0]!, status: "withdrawn" });
    }
    // The B was drawn automatically: 3 losers left, one exempt.
    expect(profile(s, "consolation")).toEqual(["3:1p+1ex"]);
    expect(consolationEntrants(s, "consolation")).toHaveLength(3);
  });
});
