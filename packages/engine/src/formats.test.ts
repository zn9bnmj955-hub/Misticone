import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { isTournamentComplete } from "./commands";
import { poolLabels, poolRanking, qualifiers } from "./formats";
import { isFinished, matchesOfRound, pairKey, roundsOf } from "./queries";
import { eliminationRanking } from "./standings";
import { exec, makeState, playToEnd, resetOps } from "./test-helpers";
import type { EngineState, Match } from "./types";

beforeEach(() => resetOps());

const all = (s: EngineState) => Object.values(s.matches);
const realMatches = (s: EngineState) => all(s).filter((m) => m.status === "done" || m.status === "forfeit");

function championOf(s: EngineState, bracket: "main" | "consolation" = "main"): string[] {
  const rounds = roundsOf(s, bracket).filter((r) => r.phase === "elimination" || r.phase === "final");
  const last = rounds[rounds.length - 1]!;
  const ms = matchesOfRound(s, last.id);
  expect(ms.length).toBe(1);
  const m = ms[0]!;
  return m.winner === "A" ? m.sideA : m.sideB;
}

describe("single elimination — fixed bracket", () => {
  it("13 teams: 3 byes, then a complete tree with one champion", () => {
    let s = makeState({ teams: 13, config: { bracketMode: "fixed", consolation: { enabled: false, losersOfRound: 1 } } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "draw" });
    expect(s.tournament.status).toBe("live");
    const r1 = matchesOfRound(s, roundsOf(s, "main")[0]!.id);
    expect(r1.length).toBe(8);
    expect(r1.filter((m) => m.status === "bye").length).toBe(3);
    expect(roundsOf(s, "main").length).toBe(4);
    s = playToEnd(s, "p1");
    expect(s.tournament.status).toBe("finished");
    expect(championOf(s).length).toBe(1);
    // 12 teams lost exactly once.
    expect(realMatches(s).length).toBe(12);
  });

  it("whatever the number of teams, the bracket always ends with one champion", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 70 }), fc.string(), (n, seed) => {
        resetOps();
        const s = playToEnd(makeState({ teams: n, config: { bracketMode: "fixed", consolation: { enabled: false, losersOfRound: 1 } } }), seed);
        expect(isTournamentComplete(s)).toBe(true);
        expect(realMatches(s).length).toBe(n - 1);
        const losses = new Map<string, number>();
        for (const m of realMatches(s)) for (const id of m.winner === "A" ? m.sideB : m.sideA) losses.set(id, (losses.get(id) ?? 0) + 1);
        expect([...losses.values()].every((v) => v === 1)).toBe(true);
        expect(losses.size).toBe(n - 1);
      }),
      { numRuns: 60 },
    );
  });
});

describe("single elimination — new draw every round", () => {
  it("odd rounds give one bye and nobody gets two byes while others got none", () => {
    let s = makeState({ teams: 23, config: { bracketMode: "redraw", consolation: { enabled: false, losersOfRound: 1 } } });
    s = playToEnd(s, "redraw");
    const byes = all(s).filter((m) => m.status === "bye");
    const perTeam = new Map<string, number>();
    byes.forEach((m) => perTeam.set(m.sideA[0]!, (perTeam.get(m.sideA[0]!) ?? 0) + 1));
    expect(Math.max(...perTeam.values())).toBe(1);
    for (const r of roundsOf(s, "main")) {
      expect(matchesOfRound(s, r.id).filter((m) => m.status === "bye").length).toBeLessThanOrEqual(1);
    }
    expect(championOf(s).length).toBe(1);
    expect(s.tournament.status).toBe("finished");
  });

  it("any team count terminates with one champion", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 70 }), fc.string(), (n, seed) => {
        resetOps();
        const s = playToEnd(makeState({ teams: n, config: { bracketMode: "redraw", consolation: { enabled: false, losersOfRound: 1 } } }), seed);
        expect(s.tournament.status).toBe("finished");
        expect(realMatches(s).length).toBe(n - 1);
      }),
      { numRuns: 60 },
    );
  });

  it("waits for the whole round before drawing the next one", () => {
    let s = makeState({ teams: 8, config: { bracketMode: "redraw", consolation: { enabled: false, losersOfRound: 1 } } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "d" });
    const r1 = matchesOfRound(s, roundsOf(s, "main")[0]!.id);
    for (const m of r1.slice(0, 3)) s = exec(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 4 });
    expect(roundsOf(s, "main").length).toBe(1);
    s = exec(s, { type: "match.score", matchId: r1[3]!.id, scoreA: 2, scoreB: 13 });
    expect(roundsOf(s, "main").length).toBe(2);
  });

  it("without automatic rounds, the organizer launches each draw", () => {
    let s = makeState({ teams: 4, config: { bracketMode: "redraw", autoNextRound: false, consolation: { enabled: false, losersOfRound: 1 } } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "d" });
    for (const m of matchesOfRound(s, roundsOf(s, "main")[0]!.id)) s = exec(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 1 });
    expect(roundsOf(s, "main").length).toBe(1);
    expect(s.tournament.status).toBe("live");
    s = exec(s, { type: "round.draw", bracket: "main", seed: "d2" });
    expect(roundsOf(s, "main").length).toBe(2);
  });
});

describe("consolation bracket", () => {
  it("first-round losers play their own bracket, drawn automatically", () => {
    let s = makeState({ teams: 16, config: { bracketMode: "redraw", consolation: { enabled: true, losersOfRound: 1 } } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "d" });
    const r1 = matchesOfRound(s, roundsOf(s, "main")[0]!.id);
    const losers = new Set<string>();
    for (const m of r1) {
      s = exec(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 5 });
      losers.add(m.sideB[0]!);
    }
    const c1 = roundsOf(s, "consolation");
    expect(c1.length).toBe(1);
    const consolationTeams = new Set(matchesOfRound(s, c1[0]!.id).flatMap((m) => [...m.sideA, ...m.sideB]));
    expect(consolationTeams).toEqual(losers);
    s = playToEnd(s, "c");
    expect(championOf(s, "consolation").length).toBe(1);
    expect(s.tournament.status).toBe("finished");
  });

  it("works with a fixed main bracket and an odd number of losers", () => {
    const s = playToEnd(makeState({ teams: 22, config: { bracketMode: "fixed", consolation: { enabled: true, losersOfRound: 1 } } }), "fx");
    expect(s.tournament.status).toBe("finished");
    expect(championOf(s, "consolation").length).toBe(1);
  });
});

describe("same club in the first round", () => {
  it("never pairs two teams of the same club in round 1 when possible", () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 64 }), fc.string(), fc.constantFrom("fixed", "redraw"), (n, seed, mode) => {
        resetOps();
        const clubs = ["La Boule Aubagnaise", "Les Cigales", "Pétanque Gémenosienne", null];
        let s = makeState({ teams: n, clubs: (i) => clubs[i % 4]!, config: { bracketMode: mode as "fixed" | "redraw" } });
        s = exec(s, { type: "round.draw", bracket: "main", seed });
        const r1 = matchesOfRound(s, roundsOf(s, "main")[0]!.id);
        const conflicts = r1.filter((m) => {
          const a = s.teams[m.sideA[0]!]?.club;
          const b = m.sideB[0] ? s.teams[m.sideB[0]]?.club : undefined;
          return a && b && a === b;
        });
        expect(conflicts).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});

describe("pools then final phase", () => {
  it("pétanque pools of 4 in 3 games, then a crossed final bracket", () => {
    let s = makeState({ teams: 16, config: { format: "pools_then_bracket", consolation: { enabled: false, losersOfRound: 1 } } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "pools" });
    expect(poolLabels(s)).toEqual(["A", "B", "C", "D"]);
    // Round 1: two matches per pool.
    expect(matchesOfRound(s, roundsOf(s, "main", "pool")[0]!.id).length).toBe(8);
    s = playToEnd(s, "p");
    for (const label of poolLabels(s)) expect(all(s).filter((m) => m.pool === label).length).toBe(5);
    const q = qualifiers(s);
    expect(q.length).toBe(8);
    const final = roundsOf(s, "main", "final");
    expect(final.length).toBe(3);
    // First final round never opposes two teams of the same pool.
    const poolOf = new Map(q.map((x) => [x.id, x.pool]));
    for (const m of matchesOfRound(s, final[0]!.id)) expect(poolOf.get(m.sideA[0]!)).not.toBe(poolOf.get(m.sideB[0]!));
    expect(s.tournament.status).toBe("finished");
  });

  it("odd counts make pools of 3 played as round robin", () => {
    const s = playToEnd(makeState({ teams: 10, config: { format: "pools_then_bracket" } }), "odd");
    expect(poolLabels(s).length).toBe(3);
    expect(s.tournament.status).toBe("finished");
  });

  it("football: round-robin pools with draws, knockout final", () => {
    const s = playToEnd(makeState({ teams: 8, sport: "football", venues: 2 }), "foot");
    expect(poolLabels(s)).toEqual(["A", "B"]);
    for (const label of poolLabels(s)) {
      const ms = all(s).filter((m) => m.pool === label);
      expect(ms.length).toBe(6);
      expect(poolRanking(s, label).length).toBe(4);
    }
    const finals = all(s).filter((m) => s.rounds[m.roundId]!.phase === "final");
    expect(finals.every((m) => m.winner === "A" || m.winner === "B")).toBe(true);
    expect(s.tournament.status).toBe("finished");
  });

  it("non-qualified teams can play a consolation bracket", () => {
    const s = playToEnd(makeState({ teams: 12, config: { format: "pools_then_bracket", consolation: { enabled: true, losersOfRound: 1 } } }), "pc");
    const cons = roundsOf(s, "consolation");
    expect(cons.length).toBeGreaterThan(0);
    const consTeams = new Set(all(s).filter((m) => cons.some((r) => r.id === m.roundId)).flatMap((m) => [...m.sideA, ...m.sideB]));
    const q = new Set(qualifiers(s).map((x) => x.id));
    for (const id of consTeams) expect(q.has(id)).toBe(false);
  });
});

describe("swiss system", () => {
  it("fixed number of rounds, no rematch, fair byes", () => {
    let s = makeState({ teams: 9, config: { format: "swiss", rounds: 4 } });
    s = playToEnd(s, "swiss");
    expect(roundsOf(s, "main", "swiss").length).toBe(4);
    const seen = new Set<string>();
    for (const m of all(s)) {
      if (m.status === "bye") continue;
      const key = pairKey(m.sideA[0]!, m.sideB[0]!);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    const byes = all(s).filter((m) => m.status === "bye").map((m) => m.sideA[0]);
    expect(new Set(byes).size).toBe(byes.length);
    for (const t of Object.keys(s.teams)) expect(all(s).filter((m) => [...m.sideA, ...m.sideB].includes(t)).length).toBe(4);
    expect(s.tournament.status).toBe("finished");
  });
});

describe("championship (round robin)", () => {
  it("everyone meets everyone once", () => {
    const s = playToEnd(makeState({ teams: 5, config: { format: "round_robin" } }), "rr");
    expect(realMatches(s).length).toBe(10);
    expect(s.tournament.status).toBe("finished");
  });
});

describe("mêlée tournante", () => {
  it("new partners every round, resting players rotate", () => {
    let s = makeState({ teams: 22, teamFormat: "doublette", config: { format: "melee_rotation", rounds: 4 } });
    s = playToEnd(s, "melee");
    const rounds = roundsOf(s, "main", "melee");
    expect(rounds.length).toBe(4);
    for (const r of rounds) {
      const ms = matchesOfRound(s, r.id);
      expect(ms.filter((m) => m.status !== "bye").length).toBe(5);
      expect(ms.filter((m) => m.status === "bye").length).toBe(2);
      for (const m of ms.filter((x: Match) => x.status !== "bye")) expect([m.sideA.length, m.sideB.length]).toEqual([2, 2]);
    }
    const rested = all(s).filter((m) => m.status === "bye").map((m) => m.sideA[0]);
    expect(new Set(rested).size).toBe(rested.length);
    expect(s.tournament.status).toBe("finished");
  });
});

describe("elimination ranking", () => {
  it("champion first, finalist second, semi-finalists share third place", () => {
    const s = playToEnd(makeState({ teams: 8, config: { bracketMode: "fixed", consolation: { enabled: false, losersOfRound: 1 } } }), "rank");
    const ranking = eliminationRanking(s, roundsOf(s, "main").map((r) => r.id));
    expect(ranking.map((r) => r.rank)).toEqual([1, 2, 3, 3, 5, 5, 5, 5]);
    expect(ranking[0]!.id).toBe(championOf(s)[0]);
    expect(all(s).every(isFinished)).toBe(true);
  });
});
