import { describe, expect, it } from "vitest";
import { rankTeams } from "./standings";
import { estimatePlan } from "./venues";
import { makeState, playToEnd, resetOps } from "./test-helpers";
import { rulesFromSport } from "./config";
import { requireSport } from "@orgasport/sports";
import type { EngineState, Match } from "./types";

function m(id: string, a: string, b: string, scoreA: number, scoreB: number): Match {
  return {
    id,
    roundId: "r1",
    position: 1,
    pool: null,
    sideA: [a],
    sideB: [b],
    venueId: null,
    scheduledAt: null,
    startedAt: null,
    endedAt: null,
    queuedAt: null,
    scoreA,
    scoreB,
    tiebreakA: null,
    tiebreakB: null,
    winner: scoreA > scoreB ? "A" : scoreA < scoreB ? "B" : "draw",
    status: "done",
  };
}

const ids = ["team-001", "team-002", "team-003", "team-004"];

describe("ranking with tie-breaks", () => {
  const s: EngineState = makeState({ teams: 4 });

  it("orders by wins, then point difference, then points scored", () => {
    const matches = [
      m("1", "team-001", "team-002", 13, 12), // 1 beats 2 (+1)
      m("2", "team-003", "team-004", 13, 0), // 3 beats 4 (+13)
      m("3", "team-001", "team-004", 13, 10),
      m("4", "team-003", "team-002", 5, 13),
    ];
    const r = rankTeams(s, ids, matches, ["wins", "point_diff", "points_for"]);
    // 2 and 3 both have one win: 2 is +7, 3 is +5.
    expect(r.map((x) => x.id)).toEqual(["team-001", "team-002", "team-003", "team-004"]);
    expect(r[0]!.stats).toMatchObject({ wins: 2, pointsFor: 26, pointsAgainst: 22, diff: 4 });
  });

  it("points scored separate teams with the same wins and difference", () => {
    const matches = [m("1", "team-001", "team-002", 13, 10), m("2", "team-003", "team-004", 6, 3)];
    const r = rankTeams(s, ids, matches, ["wins", "point_diff", "points_for"]);
    expect(r.map((x) => x.id)).toEqual(["team-001", "team-003", "team-002", "team-004"]);
  });

  it("uses head-to-head between the tied teams only", () => {
    const matches = [
      m("1", "team-001", "team-002", 13, 12),
      m("2", "team-002", "team-003", 13, 0),
      m("3", "team-003", "team-001", 13, 11),
      m("4", "team-001", "team-004", 13, 0),
      m("5", "team-002", "team-004", 13, 0),
    ];
    // 1 and 2 both have 2 wins; 1 beat 2.
    const r = rankTeams(s, ids, matches, ["wins", "head_to_head", "point_diff"]);
    expect(r.slice(0, 2).map((x) => x.id)).toEqual(["team-001", "team-002"]);
  });

  it("teams equal on every criterion share a rank; random breaks ties reproducibly", () => {
    const matches = [m("1", "team-001", "team-002", 13, 7), m("2", "team-003", "team-004", 13, 7)];
    const shared = rankTeams(s, ids, matches, ["wins", "point_diff"]);
    expect(shared.map((x) => x.rank)).toEqual([1, 1, 3, 3]);
    const a = rankTeams(s, ids, matches, ["wins", "point_diff", "random"], "seed");
    const b = rankTeams(s, ids, matches, ["wins", "point_diff", "random"], "seed");
    expect(a.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });

  it("football uses match points (3/1/0)", () => {
    const foot = makeState({ teams: 4, sport: "football" });
    const matches = [m("1", "team-001", "team-002", 1, 1), m("2", "team-003", "team-004", 2, 0), m("3", "team-001", "team-004", 3, 0)];
    const r = rankTeams(foot, ids, matches, ["match_points", "point_diff"]);
    expect(r[0]).toMatchObject({ id: "team-001", stats: { matchPoints: 4 } });
    expect(r[1]).toMatchObject({ id: "team-003", stats: { matchPoints: 3 } });
  });

  it("a whole swiss tournament produces a complete, consistent ranking", () => {
    resetOps();
    const s2 = playToEnd(makeState({ teams: 12, config: { format: "swiss", rounds: 4 } }), "sw");
    const r = rankTeams(s2, Object.keys(s2.teams), Object.values(s2.matches), s2.tournament.config.ranking, "x");
    expect(r.length).toBe(12);
    for (let i = 1; i < r.length; i++) expect(r[i]!.stats.wins).toBeLessThanOrEqual(r[i - 1]!.stats.wins);
  });
});

describe("planning estimate", () => {
  it("64 doublettes on 20 venues: 32 venues needed, 12 matches delayed", () => {
    const rules = rulesFromSport(requireSport("petanque"), "doublette");
    const plan = estimatePlan({ teams: 64, format: "single_elimination", venues: 20, rules, startAt: "2026-10-12T12:00:00.000Z" });
    expect(plan.firstRoundVenuesNeeded).toBe(32);
    expect(plan.firstRoundDelayed).toBe(12);
    expect(plan.rounds.map((r) => r.matches)).toEqual([32, 16, 8, 4, 2, 1]);
    // 2 waves in round 1, then 1 wave per round: 7 waves of 55 minutes.
    expect(plan.end).toBe(new Date(Date.parse("2026-10-12T12:00:00.000Z") + 7 * 55 * 60_000).toISOString());
  });
  it("football in time slots on one or two pitches", () => {
    const rules = rulesFromSport(requireSport("football"), "foot-7");
    const plan = estimatePlan({ teams: 8, format: "pools_then_bracket", venues: 2, rules, startAt: "2026-10-12T08:00:00.000Z", poolSystem: "round_robin", poolSize: 4 });
    // 2 pools of 4: 12 pool matches, then semi-finals and final.
    expect(plan.totalMatches).toBe(15);
    expect(new Date(plan.end).getTime()).toBeGreaterThan(Date.parse("2026-10-12T08:00:00.000Z"));
  });
});
