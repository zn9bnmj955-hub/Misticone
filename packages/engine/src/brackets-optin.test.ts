import { beforeEach, describe, expect, it } from "vitest";
import { applyCommand } from "./commands";
import { EngineError } from "./errors";
import { canDrawNext, consolationEntrants } from "./formats";
import { matchesOfRound, roundsOf } from "./queries";
import { createIdGenerator } from "./rng";
import { exec, makeState, playToEnd, resetOps, type TestConfig } from "./test-helpers";
import { applyChanges, invertChanges } from "./tx";
import type { EngineState } from "./types";

/** Lot 2, M4: teams enter the B or the C on their own (« opt_in », paid at the table). */

beforeEach(() => resetOps());

const OPT_IN: TestConfig = {
  bracketMode: "redraw",
  consolation: { enabled: true, entry: "opt_in", feeCents: 500 },
  consolationC: { enabled: true, entry: "opt_in" },
};

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof EngineError ? e.code : String(e);
  }
  return "OK";
};

/** 13 teams, the A's 1st game played: 6 losers may enter the B. */
function afterFirstGame(): { s: EngineState; losers: string[] } {
  let s = exec(makeState({ teams: 13, config: OPT_IN }), { type: "round.draw", bracket: "main", seed: "a" });
  const r1 = roundsOf(s, "main")[0]!;
  for (const m of matchesOfRound(s, r1.id)) if (m.status !== "bye") s = exec(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 4 });
  const losers = matchesOfRound(s, r1.id).filter((m) => m.status !== "bye").map((m) => m.sideB[0]!);
  return { s, losers };
}

describe("opt_in B and C", () => {
  it("the B's first draw is manual and only takes the teams entered", () => {
    let { s, losers } = afterFirstGame();
    expect(roundsOf(s, "consolation")).toHaveLength(0);
    expect(consolationEntrants(s, "consolation")).toHaveLength(0);
    expect(canDrawNext(s, "consolation")).toBe(false);
    for (const id of losers.slice(0, 4)) s = exec(s, { type: "team.enterBracket", teamId: id, bracket: "consolation", enter: true });
    // Entered, but nothing is drawn until the table says so.
    expect(roundsOf(s, "consolation")).toHaveLength(0);
    expect(canDrawNext(s, "consolation")).toBe(true);
    s = exec(s, { type: "round.draw", bracket: "consolation", seed: "b" });
    const drawn = matchesOfRound(s, roundsOf(s, "consolation")[0]!.id).flatMap((m) => [...m.sideA, ...m.sideB]);
    expect(new Set(drawn)).toEqual(new Set(losers.slice(0, 4)));
  });

  it("a team that did not lose the 1st game is never drawn in the B, even if entered", () => {
    let { s, losers } = afterFirstGame();
    const winner = Object.keys(s.teams).find((id) => !losers.includes(id))!;
    for (const id of [winner, ...losers.slice(0, 2)]) s = exec(s, { type: "team.enterBracket", teamId: id, bracket: "consolation", enter: true });
    expect(consolationEntrants(s, "consolation").map((t) => t.id).sort()).toEqual(losers.slice(0, 2).sort());
  });

  it("entries close with the first draw of the bracket; a disabled bracket refuses them", () => {
    let { s, losers } = afterFirstGame();
    for (const id of losers.slice(0, 2)) s = exec(s, { type: "team.enterBracket", teamId: id, bracket: "consolation", enter: true });
    s = exec(s, { type: "round.draw", bracket: "consolation", seed: "b" });
    expect(code(() => exec(s, { type: "team.enterBracket", teamId: losers[3]!, bracket: "consolation", enter: true }))).toBe("ROUND_ALREADY_DRAWN");
    const noC = makeState({ teams: 4, config: { ...OPT_IN, consolationC: { enabled: false } } });
    expect(code(() => exec(noC, { type: "team.enterBracket", teamId: "team-001", bracket: "consolation_c", enter: true }))).toBe("BRACKET_DISABLED");
    const noB = makeState({ teams: 4, config: { ...OPT_IN, consolation: { enabled: false } } });
    expect(code(() => exec(noB, { type: "team.enterBracket", teamId: "team-001", bracket: "consolation", enter: true }))).toBe("BRACKET_DISABLED");
  });

  it("leaving the bracket before its draw, and undoing an entry, both work", () => {
    let { s, losers } = afterFirstGame();
    const id = losers[0]!;
    s = exec(s, { type: "team.enterBracket", teamId: id, bracket: "consolation", enter: true });
    s = exec(s, { type: "team.enterBracket", teamId: id, bracket: "consolation_c", enter: true });
    expect(s.teams[id]!.entries).toEqual(["consolation", "consolation_c"]);
    s = exec(s, { type: "team.enterBracket", teamId: id, bracket: "consolation", enter: false });
    expect(s.teams[id]!.entries).toEqual(["consolation_c"]);
    // Undo = apply the inverse of the recorded changes.
    const before = s;
    const { state, changes } = applyCommand(s, { type: "team.enterBracket", teamId: id, bracket: "consolation", enter: true }, { now: "2026-10-12T15:00:00.000Z", newId: createIdGenerator("u") });
    expect(state.teams[id]!.entries).toEqual(["consolation", "consolation_c"]);
    expect(consolationEntrants(state, "consolation").map((t) => t.id)).toContain(id);
    const back = applyChanges(state, invertChanges(changes));
    expect(back.teams[id]!.entries).toEqual(["consolation_c"]);
    expect(back).toEqual(before);
  });

  it("the C is opt_in too: its first draw waits for the table, with the B's 1st-game losers that entered", () => {
    let { s, losers } = afterFirstGame();
    for (const id of losers) s = exec(s, { type: "team.enterBracket", teamId: id, bracket: "consolation", enter: true });
    s = exec(s, { type: "round.draw", bracket: "consolation", seed: "b" });
    const b1 = roundsOf(s, "consolation")[0]!;
    for (const m of matchesOfRound(s, b1.id)) s = exec(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 2 });
    const bLosers = matchesOfRound(s, b1.id).map((m) => m.sideB[0]!);
    expect(roundsOf(s, "consolation_c")).toHaveLength(0);
    expect(canDrawNext(s, "consolation_c")).toBe(false);
    // The B keeps going on its own after its first (manual) draw.
    expect(roundsOf(s, "consolation")).toHaveLength(2);
    for (const id of bLosers.slice(0, 2)) s = exec(s, { type: "team.enterBracket", teamId: id, bracket: "consolation_c", enter: true });
    s = exec(s, { type: "round.draw", bracket: "consolation_c", seed: "c" });
    const c1 = matchesOfRound(s, roundsOf(s, "consolation_c")[0]!.id);
    expect(new Set(c1.flatMap((m) => [...m.sideA, ...m.sideB]))).toEqual(new Set(bLosers.slice(0, 2)));
  });

  it("the C needs at least 4 teams at the B's start, entries counted (3 entered: C refused; 4 entered: C drawn)", () => {
    const bThenC = (entered: number) => {
      let { s, losers } = afterFirstGame();
      for (const id of losers.slice(0, entered)) s = exec(s, { type: "team.enterBracket", teamId: id, bracket: "consolation", enter: true });
      s = exec(s, { type: "round.draw", bracket: "consolation", seed: "b" });
      const b1 = roundsOf(s, "consolation")[0]!;
      for (const m of matchesOfRound(s, b1.id)) if (m.status !== "bye") s = exec(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 2 });
      const bLosers = matchesOfRound(s, b1.id).filter((m) => m.status !== "bye").map((m) => m.sideB[0]!);
      for (const id of bLosers) s = exec(s, { type: "team.enterBracket", teamId: id, bracket: "consolation_c", enter: true });
      return s;
    };
    // 3 entered in the B: 1 game + 1 exempt, so the B started with 3 teams.
    const three = bThenC(3);
    expect(canDrawNext(three, "consolation_c")).toBe(false);
    expect(code(() => exec(three, { type: "round.draw", bracket: "consolation_c", seed: "c" }))).toBe("NOT_ENOUGH_TEAMS");
    const end = playToEnd(three, "three");
    expect(roundsOf(end, "consolation_c")).toHaveLength(0);
    expect(end.tournament.status).toBe("finished");
    // 4 entered: the B started with 4 teams, its 2 losers entered the C, which the table can draw.
    const four = bThenC(4);
    expect(canDrawNext(four, "consolation_c")).toBe(true);
    const drawn = exec(four, { type: "round.draw", bracket: "consolation_c", seed: "c" });
    expect(roundsOf(drawn, "consolation_c")).toHaveLength(1);
  });

  it("nobody enters: the B and the C are not played and the tournament ends", () => {
    const s = playToEnd(makeState({ teams: 13, config: OPT_IN }), "nobody");
    expect(roundsOf(s, "consolation")).toHaveLength(0);
    expect(roundsOf(s, "consolation_c")).toHaveLength(0);
    expect(s.tournament.status).toBe("finished");
  });

  it("entering is refused once the tournament is finished", () => {
    const s = playToEnd(makeState({ teams: 4, config: OPT_IN }), "end");
    expect(s.tournament.status).toBe("finished");
    expect(code(() => exec(s, { type: "team.enterBracket", teamId: "team-001", bracket: "consolation", enter: true }))).toBe("TOURNAMENT_FINISHED");
  });
});
