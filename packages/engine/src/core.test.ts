import { describe, expect, it } from "vitest";
import { createIdGenerator, createRng } from "./rng";
import { Transaction, applyChanges, canInvert, compactChanges, invertChanges } from "./tx";
import { resolveScore } from "./scoring";
import { EngineError } from "./errors";
import { makeState } from "./test-helpers";
import type { ScoringRules } from "./types";

describe("seeded randomness", () => {
  it("replays the same sequence for the same seed", () => {
    const a = createRng("saint-michel");
    const b = createRng("saint-michel");
    expect([a.next(), a.next(), a.int(10)]).toEqual([b.next(), b.next(), b.int(10)]);
    expect(createRng("x").shuffle([1, 2, 3, 4, 5, 6])).toEqual(createRng("x").shuffle([1, 2, 3, 4, 5, 6]));
    expect(createRng("x").next()).not.toEqual(createRng("y").next());
  });
  it("shuffles without losing items", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    expect(createRng("s").shuffle(items).sort((a, b) => a - b)).toEqual(items);
  });
  it("derives stable UUIDs from an operation id", () => {
    const g1 = createIdGenerator("op-1");
    const g2 = createIdGenerator("op-1");
    const ids = [g1(), g1(), g1()];
    expect(ids).toEqual([g2(), g2(), g2()]);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(createIdGenerator("op-2")()).not.toEqual(ids[0]);
  });
});

describe("transactions and undo", () => {
  const base = makeState({ teams: 4 });
  it("never mutates the input state", () => {
    const tx = new Transaction(base);
    tx.update("team", "team-001", { name: "Les Cigales" });
    tx.create("venue", { id: "v-x", label: "X", position: 99, reservedForFinals: false, available: true });
    tx.remove("team", "team-002");
    expect(base.teams["team-001"]!.name).toBeNull();
    expect(base.teams["team-002"]).toBeDefined();
    expect(base.venues["v-x"]).toBeUndefined();
    expect(tx.state.teams["team-002"]).toBeUndefined();
  });
  it("inverting the changes restores the exact previous state", () => {
    const tx = new Transaction(base);
    tx.update("team", "team-001", { name: "A" });
    tx.update("team", "team-001", { name: "B", club: "C" });
    tx.create("venue", { id: "v-x", label: "X", position: 99, reservedForFinals: false, available: true });
    tx.remove("team", "team-002");
    tx.updateTournament({ status: "live" });
    const changes = tx.compacted();
    const restored = applyChanges(tx.state, invertChanges(changes));
    expect(restored).toEqual(base);
  });
  it("compacts successive changes on the same entity", () => {
    const tx = new Transaction(base);
    tx.update("team", "team-001", { name: "A" });
    tx.update("team", "team-001", { name: null });
    tx.create("venue", { id: "v-x", label: "X", position: 99, reservedForFinals: false, available: true });
    tx.remove("venue", "v-x");
    expect(compactChanges(tx.changes)).toEqual([]);
  });
  it("detects when a later change makes an undo unsafe", () => {
    const tx = new Transaction(base);
    tx.update("team", "team-001", { name: "A" });
    const changes = tx.compacted();
    expect(canInvert(tx.state, changes)).toEqual({ ok: true });
    const later = new Transaction(tx.state);
    later.update("team", "team-001", { name: "Z" });
    expect(canInvert(later.state, changes)).toEqual({ ok: false, conflicts: ["team:team-001"] });
  });
});

describe("score rules", () => {
  const petanque: ScoringRules = { mode: "points", target: 13, timeLimitMinutes: null, allowDraw: false };
  const petanqueTimed: ScoringRules = { ...petanque, timeLimitMinutes: 60 };
  const football: ScoringRules = { mode: "time", durationMinutes: 20, periods: 2, allowDraw: true, knockoutTieBreak: "penalties" };
  const code = (f: () => unknown) => {
    try {
      f();
    } catch (e) {
      return (e as EngineError).code;
    }
    return "OK";
  };

  it("pétanque: the winner has exactly 13", () => {
    expect(resolveScore(petanque, { scoreA: 13, scoreB: 7 }, true)).toBe("A");
    expect(resolveScore(petanque, { scoreA: 0, scoreB: 13 }, true)).toBe("B");
    expect(code(() => resolveScore(petanque, { scoreA: 12, scoreB: 10 }, true))).toBe("INVALID_SCORE");
    expect(code(() => resolveScore(petanque, { scoreA: 14, scoreB: 2 }, true))).toBe("INVALID_SCORE");
    expect(code(() => resolveScore(petanque, { scoreA: 13, scoreB: 13 }, true))).toBe("DRAW_NOT_ALLOWED");
    expect(code(() => resolveScore(petanque, { scoreA: -1, scoreB: 13 }, true))).toBe("INVALID_SCORE");
    expect(code(() => resolveScore(petanque, { scoreA: 13.5, scoreB: 2 }, true))).toBe("INVALID_SCORE");
  });
  it("pétanque with a time limit: any score, but no draw", () => {
    expect(resolveScore(petanqueTimed, { scoreA: 9, scoreB: 7 }, true)).toBe("A");
    expect(code(() => resolveScore(petanqueTimed, { scoreA: 8, scoreB: 8 }, true))).toBe("DRAW_NOT_ALLOWED");
  });
  it("football: draws in pools, shoot-out in knockouts", () => {
    expect(resolveScore(football, { scoreA: 1, scoreB: 1 }, false)).toBe("draw");
    expect(resolveScore(football, { scoreA: 2, scoreB: 1 }, true)).toBe("A");
    expect(code(() => resolveScore(football, { scoreA: 1, scoreB: 1 }, true))).toBe("TIEBREAK_REQUIRED");
    expect(resolveScore(football, { scoreA: 1, scoreB: 1, tiebreakA: 3, tiebreakB: 4 }, true)).toBe("B");
    expect(code(() => resolveScore(football, { scoreA: 1, scoreB: 1, tiebreakA: 4, tiebreakB: 4 }, true))).toBe("INVALID_SCORE");
  });
});
