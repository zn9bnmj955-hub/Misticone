import { beforeEach, describe, expect, it } from "vitest";
import { applyCommand, isTournamentComplete } from "./commands";
import { EngineError } from "./errors";
import { canDrawNext, pausedAt } from "./formats";
import { isRoundComplete, roundsOf, teamsInRound } from "./queries";
import { createIdGenerator } from "./rng";
import { exec, makeState, PLAYABLE_STATUSES, resetOps, type TestConfig } from "./test-helpers";
import { applyChanges, invertChanges } from "./tx";
import type { Bracket, EngineState } from "./types";

/** Lot 2, M5: two-day tournament — the automatic chain stops at the pause, tournament.resume restarts it. */

beforeEach(() => resetOps());

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof EngineError ? e.code : String(e);
  }
  return "OK";
};

/** Scores every playable match (side A wins) until none is left; never draws by hand. */
function playAll(start: EngineState): EngineState {
  let s = start;
  for (let i = 0; i < 2000; i++) {
    const m = Object.values(s.matches)
      .filter((x) => PLAYABLE_STATUSES.has(x.status))
      .sort((a, b) => (a.queuedAt ?? "").localeCompare(b.queuedAt ?? "") || a.position - b.position)[0];
    if (!m) return s;
    s = exec(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 5 });
  }
  throw new Error("too many matches");
}

const count = (s: EngineState, b: Bracket) => roundsOf(s, b).length;
const lastComplete = (s: EngineState, b: Bracket) => {
  const rs = roundsOf(s, b);
  return rs.length > 0 && isRoundComplete(s, rs[rs.length - 1]!.id);
};

const ABC: TestConfig = { bracketMode: "redraw", consolation: { enabled: true, entry: "auto" }, consolationC: { enabled: true, entry: "auto" } };

describe("two-day pause", () => {
  it("64 teams, pause before 16 left: the 1/8 is not drawn until resume; the B and the C wait too", () => {
    let s = exec(makeState({ teams: 64, config: { ...ABC, pause: { before: { remaining: 16 } } } }), { type: "round.draw", bracket: "main", seed: "d1" });
    s = playAll(s);
    // 64 -> 32 -> 16, then held.
    expect(roundsOf(s, "main").map((r) => teamsInRound(s, r))).toEqual([64, 32]);
    expect(pausedAt(s)).toEqual({ phase: "elimination", round: 3, teams: 16 });
    expect(s.tournament.status).toBe("live");
    expect(isTournamentComplete(s)).toBe(false);
    // Every bracket is idle: its last round is over and its next draw is held.
    for (const b of ["main", "consolation"] as const) expect(lastComplete(s, b)).toBe(true);
    // The A's 2nd game ended before the B's 1st: the C (losers of the B's 1st game) is not even started.
    expect(count(s, "consolation_c")).toBe(0);
    for (const b of ["main", "consolation", "consolation_c"] as const) expect(canDrawNext(s, b)).toBe(true);
    const held = { main: count(s, "main"), b: count(s, "consolation"), c: count(s, "consolation_c") };
    // A correction during the night does not restart the chain.
    const anyDone = Object.values(s.matches).find((m) => m.status === "done")!;
    s = exec(s, { type: "match.score", matchId: anyDone.id, scoreA: 13, scoreB: 6 });
    expect(count(s, "main")).toBe(held.main);

    s = exec(s, { type: "tournament.resume", seed: "day2" });
    expect(pausedAt(s)).toBeNull();
    expect(roundsOf(s, "main").map((r) => teamsInRound(s, r))).toEqual([64, 32, 16]);
    expect(count(s, "consolation")).toBe(held.b + 1);
    expect(count(s, "consolation_c")).toBe(held.c + 1);
    // The pause holds once: the rest of the day goes on to the end.
    s = playAll(s);
    expect(s.tournament.status).toBe("finished");
  });

  it("without a pause the same tournament goes straight to the end", () => {
    let s = exec(makeState({ teams: 64, config: ABC }), { type: "round.draw", bracket: "main", seed: "d1" });
    s = playAll(s);
    expect(s.tournament.status).toBe("finished");
  });

  it("afterPools: the final phase and the B (pool non-qualifiers) wait for resume", () => {
    const cfg: TestConfig = { format: "pools_then_bracket", bracketMode: "redraw", consolation: { enabled: true, entry: "auto", source: "pool_non_qualified" }, pause: "afterPools" };
    let s = exec(makeState({ teams: 16, config: cfg }), { type: "round.draw", bracket: "main", seed: "p" });
    s = playAll(s);
    expect(roundsOf(s, "main", "final")).toHaveLength(0);
    expect(count(s, "consolation")).toBe(0);
    expect(pausedAt(s)).toEqual({ phase: "final", round: 1, teams: 8 });
    s = exec(s, { type: "tournament.resume" });
    expect(roundsOf(s, "main", "final")).toHaveLength(1);
    expect(count(s, "consolation")).toBe(1);
    s = playAll(s);
    expect(s.tournament.status).toBe("finished");
  });

  it("afterRound 1: a manual round.draw of the A resumes too", () => {
    let s = exec(makeState({ teams: 13, config: { ...ABC, pause: { afterRound: 1 } } }), { type: "round.draw", bracket: "main", seed: "r" });
    s = playAll(s);
    expect(pausedAt(s)?.round).toBe(2);
    expect(count(s, "consolation")).toBe(0);
    s = exec(s, { type: "round.draw", bracket: "main", seed: "manual" });
    expect(pausedAt(s)).toBeNull();
    expect(count(s, "main")).toBe(2);
    expect(count(s, "consolation")).toBe(1);
  });

  it("resume is refused when nothing is paused", () => {
    const s = exec(makeState({ teams: 8, config: { pause: { before: { remaining: 4 } } } }), { type: "round.draw", bracket: "main", seed: "x" });
    expect(code(() => exec(s, { type: "tournament.resume" }))).toBe("NOTHING_TO_DRAW");
  });

  it("undoing resume brings the pause back exactly", () => {
    let s = exec(makeState({ teams: 64, config: { ...ABC, pause: { before: { remaining: 16 } } } }), { type: "round.draw", bracket: "main", seed: "d1" });
    s = playAll(s);
    const r = applyCommand(s, { type: "tournament.resume", seed: "day2" }, { now: "2026-10-13T08:00:00.000Z", newId: createIdGenerator("resume") });
    expect(pausedAt(r.state)).toBeNull();
    const back = applyChanges(r.state, invertChanges(r.changes));
    expect(back).toEqual(s);
    expect(pausedAt(back)).not.toBeNull();
  });
});

describe("two-day pause — field not a power of two (testeur)", () => {
  it("40 teams, pause before 16 left: the cadrage is played on day 1, the 1/8 waits for resume", () => {
    let s = exec(makeState({ teams: 40, config: { bracketMode: "redraw", pause: { before: { remaining: 16 } } } }), { type: "round.draw", bracket: "main", seed: "c40" });
    s = playAll(s);
    // 40 -> 20 -> cadrage (20 teams: 4 games + 12 « d'office ») -> 16, then held.
    expect(roundsOf(s, "main").map((r) => teamsInRound(s, r))).toEqual([40, 20]);
    expect(pausedAt(s)).toEqual({ phase: "elimination", round: 3, teams: 16 });
    s = exec(s, { type: "tournament.resume", seed: "day2" });
    expect(roundsOf(s, "main").map((r) => teamsInRound(s, r))).toEqual([40, 20, 16]);
    s = playAll(s);
    expect(s.tournament.status).toBe("finished");
  });

  it("41 teams (exempt in the 1st game), pause before 16 left: held before the 1/8 only", () => {
    let s = exec(makeState({ teams: 41, config: { bracketMode: "redraw", pause: { before: { remaining: 16 } } } }), { type: "round.draw", bracket: "main", seed: "c41" });
    s = playAll(s);
    expect(pausedAt(s)?.teams).toBe(16);
    expect(roundsOf(s, "main").map((r) => teamsInRound(s, r))).toEqual([41, 21]);
  });

  it("undoing the manual round.draw that resumed brings the pause back", () => {
    let s = exec(makeState({ teams: 64, config: { ...ABC, pause: { before: { remaining: 16 } } } }), { type: "round.draw", bracket: "main", seed: "d1" });
    s = playAll(s);
    const r = applyCommand(s, { type: "round.draw", bracket: "main", seed: "m" }, { now: "2026-10-13T08:00:00.000Z", newId: createIdGenerator("manual") });
    expect(pausedAt(r.state)).toBeNull();
    const back = applyChanges(r.state, invertChanges(r.changes));
    expect(back).toEqual(s);
    expect(pausedAt(back)).toEqual({ phase: "elimination", round: 3, teams: 16 });
  });
});

describe("two-day pause — final phase after pools (testeur)", () => {
  it("32 teams in pools, pause before 8 left: the 1/4 of the final phase waits for resume, the B too; undo of resume brings it back", () => {
    const cfg: TestConfig = { format: "pools_then_bracket", bracketMode: "redraw", consolation: { enabled: true, entry: "auto", source: "pool_non_qualified" }, pause: { before: { remaining: 8 } } };
    let s = exec(makeState({ teams: 32, config: cfg }), { type: "round.draw", bracket: "main", seed: "pp" });
    s = playAll(s);
    // 16 qualifiers -> 1/8 played on day 1 -> 8 left, held before the 1/4.
    expect(roundsOf(s, "main", "final").map((r) => teamsInRound(s, r))).toEqual([16]);
    expect(pausedAt(s)).toEqual({ phase: "final", round: 2, teams: 8 });
    const b = count(s, "consolation");
    expect(lastComplete(s, "consolation")).toBe(true);
    expect(canDrawNext(s, "consolation")).toBe(true);
    const r = applyCommand(s, { type: "tournament.resume", seed: "day2" }, { now: "2026-10-13T08:00:00.000Z", newId: createIdGenerator("resume") });
    expect(roundsOf(r.state, "main", "final").map((x) => teamsInRound(r.state, x))).toEqual([16, 8]);
    expect(count(r.state, "consolation")).toBe(b + 1);
    expect(applyChanges(r.state, invertChanges(r.changes))).toEqual(s);
    expect(playAll(r.state).tournament.status).toBe("finished");
  });
});
