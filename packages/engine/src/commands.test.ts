import { beforeEach, describe, expect, it } from "vitest";
import { applyCommand } from "./commands";
import { EngineError } from "./errors";
import { matchesOfRound, roundsOf, statusBeforeForfeit, teamsLeftOut } from "./queries";
import { createIdGenerator } from "./rng";
import { applyChanges, canInvert, conflictsWithLater, invertChanges } from "./tx";
import { exec, makeState, playToEnd, resetOps } from "./test-helpers";
import type { EngineState, Match } from "./types";

beforeEach(() => resetOps());

const code = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    if (e instanceof EngineError) return e.code;
    throw e;
  }
  return "OK";
};
const r1Matches = (s: EngineState, bracket: "main" | "consolation" = "main") => matchesOfRound(s, roundsOf(s, bracket)[0]!.id);
const findMatchOf = (s: EngineState, teamId: string, roundIndex = 0) =>
  matchesOfRound(s, roundsOf(s, "main")[roundIndex]!.id).find((m) => [...m.sideA, ...m.sideB].includes(teamId))!;
const noConsolation = { consolation: { enabled: false, losersOfRound: 1 } };

describe("check-in and on-site registration", () => {
  it("adds a team on site, already checked in, with a score code", () => {
    let s = makeState({ teams: 3, status: "check_in" });
    s = exec(s, { type: "team.create", club: "Les Cigales", players: [{ firstName: "Marie", lastName: "Curie" }, { firstName: "Paul", lastName: "Dupont" }], checkIn: true });
    const team = Object.values(s.teams).find((t) => t.number === 4)!;
    expect(team.status).toBe("checked_in");
    expect(Object.values(s.players).filter((p) => p.teamId === team.id).map((p) => p.lastName)).toEqual(["Curie", "Dupont"]);
    expect(s.teamSecrets[team.id]!.code).toMatch(/^\d{4}$/);
  });
  it("puts new teams on the waiting list when the tournament is full", () => {
    let s = makeState({ teams: 4, maxTeams: 4 });
    s = exec(s, { type: "team.create", players: [{ firstName: "A", lastName: "B" }], checkIn: true });
    expect(Object.values(s.teams).find((t) => t.number === 5)!.status).toBe("waitlist");
  });
  it("only checked-in teams are drawn", () => {
    let s = makeState({ teams: 6, config: noConsolation });
    s = exec(s, { type: "team.setStatus", teamId: "team-006", status: "registered" });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const drawn = new Set(Object.values(s.matches).flatMap((m) => [...m.sideA, ...m.sideB]));
    expect(drawn.has("team-006")).toBe(false);
    expect(drawn.size).toBe(5);
  });
  it("cancelling a forfeit brings a checked-in team back into the draw", () => {
    let s = makeState({ teams: 6, config: noConsolation });
    s = exec(s, { type: "team.setStatus", teamId: "team-006", status: "forfeit" });
    expect(statusBeforeForfeit(s.teams["team-006"]!)).toBe("checked_in");
    s = exec(s, { type: "team.setStatus", teamId: "team-006", status: statusBeforeForfeit(s.teams["team-006"]!) });
    expect(teamsLeftOut(s)).toEqual([]);
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    expect(new Set(Object.values(s.matches).flatMap((m) => [...m.sideA, ...m.sideB])).has("team-006")).toBe(true);
  });
  it("lists registered teams left out of the draw, and restores never-checked teams as registered", () => {
    let s = makeState({ teams: 4, teamStatus: "registered" });
    expect(teamsLeftOut(s)).toEqual([]);
    s = exec(s, { type: "team.setStatus", teamId: "team-001", status: "checked_in" });
    expect(teamsLeftOut(s).map((t) => t.id)).toEqual(["team-002", "team-003", "team-004"]);
    s = exec(s, { type: "team.setStatus", teamId: "team-004", status: "forfeit" });
    expect(statusBeforeForfeit(s.teams["team-004"]!)).toBe("registered");
  });
});

describe("forfeits", () => {
  it("a forfeit sends the opponent through with the forfeit score", () => {
    let s = makeState({ teams: 4, config: { bracketMode: "fixed", ...noConsolation } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const m = r1Matches(s)[0]!;
    s = exec(s, { type: "match.forfeit", matchId: m.id, side: "A" });
    const after = s.matches[m.id]!;
    expect(after.status).toBe("forfeit");
    expect(after.winner).toBe("B");
    expect([after.scoreA, after.scoreB]).toEqual([0, 13]);
    const final = matchesOfRound(s, roundsOf(s, "main")[1]!.id)[0]!;
    expect(final.sideA).toEqual(m.sideB);
  });
  it("a team declared absent loses its pending matches, even later ones", () => {
    let s = makeState({ teams: 8, config: { bracketMode: "fixed", ...noConsolation } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const m = r1Matches(s)[0]!;
    const absent = m.sideA[0]!;
    s = exec(s, { type: "team.setStatus", teamId: absent, status: "forfeit" });
    expect(s.matches[m.id]!.status).toBe("forfeit");
    expect(s.matches[m.id]!.winner).toBe("B");
  });
  it("a double forfeit gives a walkover in the next round", () => {
    let s = makeState({ teams: 8, config: { bracketMode: "fixed", ...noConsolation } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const [m1, m2] = r1Matches(s);
    s = exec(s, { type: "match.forfeit", matchId: m1!.id, side: "both" });
    s = exec(s, { type: "match.score", matchId: m2!.id, scoreA: 13, scoreB: 8 });
    const semi = matchesOfRound(s, roundsOf(s, "main")[1]!.id)[0]!;
    expect(semi.status).toBe("bye");
    expect(semi.sideA).toEqual(m2!.sideA);
    s = playToEnd(s, "rest");
    expect(s.tournament.status).toBe("finished");
  });
});

describe("latecomers", () => {
  it("a latecomer takes the bye of the current round", () => {
    let s = makeState({ teams: 7, config: { bracketMode: "redraw", ...noConsolation } });
    s = exec(s, { type: "team.create", players: [{ firstName: "Léo", lastName: "Retard" }] });
    const late = Object.values(s.teams).find((t) => t.number === 8)!;
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    expect(Object.values(s.matches).filter((m) => m.status === "bye").length).toBe(1);
    s = exec(s, { type: "team.lateEntry", teamId: late.id });
    expect(Object.values(s.matches).filter((m) => m.status === "bye").length).toBe(0);
    expect(Object.values(s.matches).some((m) => m.sideB.includes(late.id) && m.status === "ready")).toBe(true);
    expect(s.teams[late.id]!.status).toBe("checked_in");
  });
  it("in a fixed bracket the bye is taken back from the next round", () => {
    let s = makeState({ teams: 7, config: { bracketMode: "fixed", ...noConsolation } });
    s = exec(s, { type: "team.create", players: [{ firstName: "Léo", lastName: "Retard" }] });
    const late = Object.values(s.teams).find((t) => t.number === 8)!;
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const bye = r1Matches(s).find((m) => m.status === "bye")!;
    s = exec(s, { type: "team.lateEntry", teamId: late.id });
    expect(s.matches[bye.id]!.status).toBe("ready");
    const semi = matchesOfRound(s, roundsOf(s, "main")[1]!.id).find((m) => m.sideA.includes(bye.sideA[0]!) || m.sideB.includes(bye.sideA[0]!));
    expect(semi).toBeUndefined();
    expect(playToEnd(s, "late").tournament.status).toBe("finished");
  });
  it("no bye left: the organizer is told there is no free slot", () => {
    let s = makeState({ teams: 8, config: noConsolation });
    s = exec(s, { type: "team.create", players: [{ firstName: "Léo", lastName: "Retard" }] });
    const late = Object.values(s.teams).find((t) => t.number === 9)!;
    s = exec(s, { type: "team.setStatus", teamId: late.id, status: "registered" });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    expect(code(() => exec(s, { type: "team.lateEntry", teamId: late.id }))).toBe("NO_FREE_SLOT");
  });
});

describe("venues", () => {
  it("not enough venues: the extra matches wait, then take the first free venue", () => {
    let s = makeState({ teams: 64, venues: 20, config: noConsolation });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const r1 = r1Matches(s);
    expect(r1.filter((m) => m.status === "ready").length).toBe(20);
    expect(r1.filter((m) => m.status === "waiting_venue").length).toBe(12);
    const first = r1.find((m) => m.status === "ready")!;
    const nextInQueue = r1.filter((m) => m.status === "waiting_venue").sort((a, b) => a.position - b.position)[0]!;
    s = exec(s, { type: "match.score", matchId: first.id, scoreA: 13, scoreB: 2 });
    expect(s.matches[nextInQueue.id]!.status).toBe("ready");
    expect(s.matches[nextInQueue.id]!.venueId).toBe(first.venueId);
  });
  it("venues reserved for the finals stay free until the semi-finals", () => {
    let s = makeState({ teams: 16, venues: 6, reservedVenues: 2, config: { bracketMode: "fixed", ...noConsolation } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const reserved = Object.values(s.venues).filter((v) => v.reservedForFinals).map((v) => v.id);
    const used = r1Matches(s).filter((m) => m.status === "ready").map((m) => m.venueId);
    expect(used.length).toBe(4);
    expect(used.some((v) => reserved.includes(v!))).toBe(false);
    s = playToEnd(s, "v");
    const final = matchesOfRound(s, roundsOf(s, "main")[3]!.id)[0]!;
    expect(reserved).toContain(final.venueId);
  });
  it("moving a match to a busy venue swaps the two venues", () => {
    let s = makeState({ teams: 8, config: noConsolation });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const [a, b] = r1Matches(s);
    s = exec(s, { type: "match.setVenue", matchId: a!.id, venueId: b!.venueId! });
    expect(s.matches[a!.id]!.venueId).toBe(b!.venueId);
    expect(s.matches[b!.id]!.venueId).toBe(a!.venueId);
  });
  it("closing a venue sends its waiting match to another one", () => {
    let s = makeState({ teams: 4, venues: 3, config: noConsolation });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const m = r1Matches(s)[0]!;
    s = exec(s, { type: "venue.update", venueId: m.venueId!, available: false });
    expect(s.matches[m.id]!.venueId).not.toBe(m.venueId);
    expect(s.matches[m.id]!.status).toBe("ready");
  });
  it("football: matches get time slots and no team plays twice at once", () => {
    let s = makeState({ teams: 8, sport: "football", venues: 2 });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const ms = Object.values(s.matches);
    expect(ms.every((m) => m.status === "ready" && m.scheduledAt)).toBe(true);
    const slot = 25 * 60_000;
    const busy = new Map<string, number[]>();
    for (const m of ms) {
      const at = new Date(m.scheduledAt!).getTime();
      for (const key of [`v:${m.venueId}`, ...[...m.sideA, ...m.sideB].map((t) => `t:${t}`)]) {
        for (const other of busy.get(key) ?? []) expect(Math.abs(other - at)).toBeGreaterThanOrEqual(slot);
        busy.set(key, [...(busy.get(key) ?? []), at]);
      }
    }
  });
});

describe("keeping control: corrections", () => {
  it("correcting a score before the next match is played moves the right team on", () => {
    let s = makeState({ teams: 4, config: { bracketMode: "fixed", ...noConsolation } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const m = r1Matches(s)[0]!;
    s = exec(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 5 });
    s = exec(s, { type: "match.score", matchId: m.id, scoreA: 6, scoreB: 13 });
    const final = matchesOfRound(s, roundsOf(s, "main")[1]!.id)[0]!;
    expect(final.sideA).toEqual(m.sideB);
  });
  it("refuses a correction that would change an already played match", () => {
    let s = makeState({ teams: 4, config: { bracketMode: "fixed", ...noConsolation } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const [m1, m2] = r1Matches(s);
    s = exec(s, { type: "match.score", matchId: m1!.id, scoreA: 13, scoreB: 5 });
    s = exec(s, { type: "match.score", matchId: m2!.id, scoreA: 13, scoreB: 5 });
    const final = matchesOfRound(s, roundsOf(s, "main")[1]!.id)[0]!;
    s = exec(s, { type: "match.score", matchId: final.id, scoreA: 13, scoreB: 11 });
    expect(code(() => exec(s, { type: "match.score", matchId: m1!.id, scoreA: 1, scoreB: 13 }))).toBe("NEXT_MATCH_PLAYED");
    // Same winner, different score: always allowed.
    expect(code(() => exec(s, { type: "match.score", matchId: m1!.id, scoreA: 13, scoreB: 9 }))).toBe("OK");
  });
  it("new draw mode: the corrected winner replaces the old one in the next round and in the consolation", () => {
    let s = makeState({ teams: 8, config: { bracketMode: "redraw", consolation: { enabled: true, losersOfRound: 1 } } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const r1 = r1Matches(s);
    for (const m of r1) s = exec(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 3 });
    const m = r1[0]!;
    const [oldWinner, oldLoser] = [m.sideA[0]!, m.sideB[0]!];
    s = exec(s, { type: "match.score", matchId: m.id, scoreA: 3, scoreB: 13 });
    const r2Teams = matchesOfRound(s, roundsOf(s, "main")[1]!.id).flatMap((x) => [...x.sideA, ...x.sideB]);
    expect(r2Teams).toContain(oldLoser);
    expect(r2Teams).not.toContain(oldWinner);
    const consTeams = r1Matches(s, "consolation").flatMap((x) => [...x.sideA, ...x.sideB]);
    expect(consTeams).toContain(oldWinner);
    expect(consTeams).not.toContain(oldLoser);
  });
  it("reopening a result puts the match back in play", () => {
    let s = makeState({ teams: 4, config: { bracketMode: "fixed", ...noConsolation } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const m = r1Matches(s)[0]!;
    s = exec(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 5 });
    s = exec(s, { type: "match.reopen", matchId: m.id });
    expect(s.matches[m.id]!.status).toBe("ready");
    expect(s.matches[m.id]!.scoreA).toBeNull();
    expect(matchesOfRound(s, roundsOf(s, "main")[1]!.id)[0]!.sideA).toEqual([]);
  });
});

describe("keeping control: swaps and new draws", () => {
  it("swaps two teams between first-round matches", () => {
    let s = makeState({ teams: 8, config: noConsolation });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const [a, b] = r1Matches(s);
    s = exec(s, { type: "match.swapTeams", a: { matchId: a!.id, side: "B" }, b: { matchId: b!.id, side: "A" } });
    expect(s.matches[a!.id]!.sideB).toEqual(b!.sideA);
    expect(s.matches[b!.id]!.sideA).toEqual(a!.sideB);
  });
  it("swapping a team with a bye in a fixed bracket keeps the tree consistent", () => {
    let s = makeState({ teams: 7, config: { bracketMode: "fixed", ...noConsolation } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const bye = r1Matches(s).find((m) => m.status === "bye")!;
    const real = r1Matches(s).find((m) => m.status === "ready")!;
    s = exec(s, { type: "match.swapTeams", a: { matchId: bye.id, side: "B" }, b: { matchId: real.id, side: "B" } });
    expect(s.matches[bye.id]!.status).toBe("ready");
    expect(s.matches[real.id]!.status).toBe("bye");
    expect(playToEnd(s, "swap").tournament.status).toBe("finished");
  });
  it("a round can be drawn again as long as no result was entered", () => {
    let s = makeState({ teams: 16, config: noConsolation });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "first" });
    const before = r1Matches(s).map((m) => [...m.sideA, ...m.sideB].join(","));
    const roundId = roundsOf(s, "main")[0]!.id;
    s = exec(s, { type: "round.redraw", roundId, seed: "second" });
    const after = r1Matches(s).map((m) => [...m.sideA, ...m.sideB].join(","));
    expect(after).not.toEqual(before);
    expect(after.length).toBe(8);
    s = exec(s, { type: "match.score", matchId: r1Matches(s)[0]!.id, scoreA: 13, scoreB: 0 });
    expect(code(() => exec(s, { type: "round.redraw", roundId: roundsOf(s, "main")[0]!.id, seed: "third" }))).toBe("ROUND_HAS_RESULTS");
  });
});

describe("undo", () => {
  const ctx = (op: string) => ({ now: "2026-10-12T14:00:00.000Z", newId: createIdGenerator(op), seed: op });

  it("undoing a draw restores the tournament exactly", () => {
    const s0 = makeState({ teams: 12, venues: 4 });
    const { state: s1, changes } = applyCommand(s0, { type: "round.draw", bracket: "main", seed: "x" }, ctx("draw"));
    expect(Object.keys(s1.matches).length).toBeGreaterThan(0);
    const back = applyChanges(s1, invertChanges(changes));
    expect(back).toEqual(s0);
  });
  it("undoing a score frees the next round and the venue queue", () => {
    let s = makeState({ teams: 8, venues: 3, config: { bracketMode: "fixed", ...noConsolation } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const m = r1Matches(s).find((x) => x.status === "ready")!;
    const { state: after, changes } = applyCommand(s, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 7 }, ctx("score"));
    expect(canInvert(after, changes)).toEqual({ ok: true });
    expect(applyChanges(after, invertChanges(changes))).toEqual(s);
  });
  it("an undo that conflicts with a later action is refused", () => {
    let s = makeState({ teams: 4, config: { bracketMode: "fixed", ...noConsolation } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const [m1, m2] = r1Matches(s);
    const first = applyCommand(s, { type: "match.score", matchId: m1!.id, scoreA: 13, scoreB: 7 }, ctx("a"));
    const second = applyCommand(first.state, { type: "match.score", matchId: m2!.id, scoreA: 13, scoreB: 7 }, ctx("b"));
    const final = matchesOfRound(second.state, roundsOf(second.state, "main")[1]!.id)[0]!;
    const third = applyCommand(second.state, { type: "match.score", matchId: final.id, scoreA: 13, scoreB: 2 }, ctx("c"));
    // The final was played after the first score: undo the final first.
    const conflicts = conflictsWithLater(first.changes, [second.changes, third.changes]);
    expect(conflicts.map((c) => c.index)).toContain(1);
    // Undoing the most recent action is always possible.
    expect(conflictsWithLater(third.changes, [])).toEqual([]);
    expect(canInvert(third.state, third.changes)).toEqual({ ok: true });
  });
});

describe("determinism (offline devices and server agree)", () => {
  it("same state + same command + same operation id = same changes", () => {
    const s = makeState({ teams: 33, venues: 10, clubs: (i) => `club-${i % 5}` });
    const cmd = { type: "round.draw" as const, bracket: "main" as const, seed: "op-42" };
    const a = applyCommand(s, cmd, { now: "2026-10-12T14:00:00.000Z", newId: createIdGenerator("op-42"), seed: "op-42" });
    const b = applyCommand(s, cmd, { now: "2026-10-12T14:00:00.000Z", newId: createIdGenerator("op-42"), seed: "op-42" });
    expect(a.changes).toEqual(b.changes);
  });
  it("rejects actions on a closed tournament", () => {
    const s = makeState({ teams: 4, status: "draft" });
    expect(code(() => exec(s, { type: "round.draw", bracket: "main", seed: "x" }))).toBe("TOURNAMENT_CLOSED");
  });
  it("cannot score a match that has no opponent yet", () => {
    let s = makeState({ teams: 4, config: { bracketMode: "fixed", ...noConsolation } });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    const final: Match = matchesOfRound(s, roundsOf(s, "main")[1]!.id)[0]!;
    expect(code(() => exec(s, { type: "match.score", matchId: final.id, scoreA: 13, scoreB: 1 }))).toBe("MATCH_NOT_PLAYABLE");
  });
});

describe("helpers used by the tests", () => {
  it("finds a team's match", () => {
    let s = makeState({ teams: 4, config: noConsolation });
    s = exec(s, { type: "round.draw", bracket: "main", seed: "x" });
    expect(findMatchOf(s, "team-001")).toBeDefined();
  });
});
