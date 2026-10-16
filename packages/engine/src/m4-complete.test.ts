import { beforeEach, describe, expect, it } from "vitest";
import { isTournamentComplete } from "./commands";
import { exec, makeState, resetOps, type TestConfig } from "./test-helpers";
import type { Bracket, EngineState } from "./types";

/** Lot 2, M4: the tournament ends only when the A, the B and the C are all over. */

beforeEach(() => resetOps());

/** Scores every open match of the given brackets (side A wins) until none is left. */
function playBrackets(s: EngineState, brackets: Bracket[]): EngineState {
  for (let i = 0; i < 200; i++) {
    const open = Object.values(s.matches).find(
      (m) => m.status !== "bye" && m.winner == null && m.sideA.length > 0 && m.sideB.length > 0 && brackets.includes(s.rounds[m.roundId]!.bracket),
    );
    if (!open) return s;
    s = exec(s, { type: "match.score", matchId: open.id, scoreA: 13, scoreB: 6 });
  }
  throw new Error("too many matches");
}

const openIn = (s: EngineState, b: Bracket) => Object.values(s.matches).filter((m) => s.rounds[m.roundId]!.bracket === b && m.winner == null && m.status !== "bye");

describe("end of the tournament with B and C", () => {
  it("auto: the A and the B over, the C still playing: not finished; the C's final scored: finished", () => {
    const BC: TestConfig = { bracketMode: "redraw", consolation: { enabled: true, entry: "auto" }, consolationC: { enabled: true, entry: "auto" } };
    let s = exec(makeState({ teams: 13, config: BC }), { type: "round.draw", bracket: "main", seed: "a" });
    s = playBrackets(s, ["main", "consolation"]);
    expect(openIn(s, "main")).toHaveLength(0);
    expect(openIn(s, "consolation")).toHaveLength(0);
    expect(openIn(s, "consolation_c").length).toBeGreaterThan(0);
    expect(isTournamentComplete(s)).toBe(false);
    expect(s.tournament.status).toBe("live");
    s = playBrackets(s, ["consolation_c"]);
    expect(isTournamentComplete(s)).toBe(true);
    expect(s.tournament.status).toBe("finished");
  });

  it("opt_in: the A over, teams entered in the B but not drawn yet: the tournament waits for the table", () => {
    const OPT: TestConfig = { bracketMode: "redraw", consolation: { enabled: true, entry: "opt_in" }, consolationC: { enabled: false } };
    let s = exec(makeState({ teams: 8, config: OPT }), { type: "round.draw", bracket: "main", seed: "a" });
    const r1 = Object.values(s.rounds).find((r) => r.bracket === "main")!;
    const firstGame = Object.values(s.matches).filter((m) => m.roundId === r1.id);
    for (const m of firstGame) s = exec(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 6 });
    // Two losers of the A's 1st game enter the B, then the A is played to its end.
    for (const m of firstGame.slice(0, 2)) s = exec(s, { type: "team.enterBracket", teamId: m.sideB[0]!, bracket: "consolation", enter: true });
    s = playBrackets(s, ["main"]);
    expect(openIn(s, "main")).toHaveLength(0);
    expect(isTournamentComplete(s)).toBe(false);
    expect(s.tournament.status).toBe("live");
    s = exec(s, { type: "round.draw", bracket: "consolation", seed: "b" });
    s = playBrackets(s, ["consolation"]);
    expect(s.tournament.status).toBe("finished");
  });
});
