import { describe, expect, it } from "vitest";
import type { EngineState, Match, Player, Round, Team } from "@orgasport/engine";
import { printDrawSections, teamAffiliation } from "./print-model";

const team = (n: number, club: string | null = null): Team => ({ id: `t${n}`, number: n, name: null, club, status: "checked_in", seed: null, bracket: "main", checkedInAt: null });
const player = (teamId: string, pos: number, first: string, last: string, club?: Player["club"]): Player => ({ id: `${teamId}p${pos}`, teamId, firstName: first, lastName: last, position: pos, club });
const round = (id: string, number: number, status: Round["status"], kind?: Round["kind"], bracket: Round["bracket"] = "main"): Round => ({ id, bracket, phase: "elimination", number, kind, status, seed: null, drawnAt: null });
const match = (id: string, roundId: string, position: number, sideA: string[], sideB: string[], extra: Partial<Match> = {}): Match => ({
  id, roundId, position, pool: null, sideA, sideB, venueId: null, scheduledAt: null, startedAt: null, endedAt: null, queuedAt: null,
  scoreA: null, scoreB: null, tiebreakA: null, tiebreakB: null, winner: null, status: "playing", ...extra,
});

const AGDE = { number: "0340901", name: "Boule du Cap Agde" };
const SETE = { number: "0340555", name: "La Boule Sétoise" };

function demo(): EngineState {
  const teams = [team(1), team(2), team(3), team(4), team(5, "Pétanque Lunelloise")];
  const players = [
    player("t1", 1, "Jean", "Martin", AGDE), player("t1", 2, "Luc", "Durand", AGDE),
    player("t2", 1, "Marie", "Petit", AGDE), player("t2", 2, "Paul", "Roux", SETE),
    player("t3", 1, "Anne", "Blanc"), player("t3", 2, "Marc", "Noir"),
    player("t4", 1, "Léa", "Vidal"), player("t4", 2, "Tom", "Faure"),
    player("t5", 1, "Ali", "Ben"), player("t5", 2, "Max", "Gros"),
  ];
  const rounds = [round("r1", 1, "finished"), round("r2", 2, "live", "cadrage"), round("b1", 1, "live", undefined, "consolation")];
  const matches = [
    match("m1", "r1", 1, ["t1"], ["t2"], { status: "done", scoreA: 13, scoreB: 7, winner: "A", venueId: "v8" }),
    match("m2", "r1", 2, ["t3"], ["t4"], { status: "done", scoreA: 5, scoreB: 13, winner: "B", venueId: "v9" }),
    match("m3", "r1", 3, ["t5"], [], { status: "bye", scoreA: 13, scoreB: 7, winner: "A" }),
    match("m4", "r2", 1, ["t1"], ["t4"], { venueId: "v8" }),
    match("m5", "r2", 2, ["t5"], [], { status: "bye", winner: "A" }),
    match("m6", "b1", 1, ["t2"], ["t3"], { venueId: "v9" }),
  ];
  return {
    teams: Object.fromEntries(teams.map((t) => [t.id, t])),
    players: Object.fromEntries(players.map((p) => [p.id, p])),
    rounds: Object.fromEntries(rounds.map((r) => [r.id, r])),
    matches: Object.fromEntries(matches.map((x) => [x.id, x])),
    venues: { v8: { id: "v8", label: "8", position: 8, reservedForFinals: false, available: true }, v9: { id: "v9", label: "9", position: 9, reservedForFinals: false, available: true } },
    teamSecrets: {},
  } as unknown as EngineState;
}

describe("printed draw sheets (ppf format)", () => {
  it("club of the team, N.H. when the players' clubs differ, typed club otherwise", () => {
    const s = demo();
    expect(teamAffiliation(s, "t1")).toBe("(0340901/BOULE DU CAP AGDE)");
    expect(teamAffiliation(s, "t2")).toBe("(N.H.)");
    expect(teamAffiliation(s, "t3")).toBeNull();
    expect(teamAffiliation(s, "t5")).toBe("(PÉTANQUE LUNELLOISE)");
  });

  it("all rounds: newest first, A before B, NOM PRÉNOM in capitals, loser greyed, ** while not played, Office in the cadrage", () => {
    const sections = printDrawSections(demo(), "all");
    expect(sections.map((x) => x.round.id)).toEqual(["r2", "r1", "b1"]);
    const [cadrage, first, b] = sections;
    expect(cadrage!.office).toBe(true);
    expect(cadrage!.rows[0]).toMatchObject({ venue: "8", score: "**" });
    expect(cadrage!.rows[0]!.a!.players).toEqual(["MARTIN JEAN", "DURAND LUC"]);
    expect(cadrage!.rows[1]!.b).toBeNull();
    expect(first!.office).toBe(false);
    expect(first!.rows[0]).toMatchObject({ venue: "8", score: "13 - 7" });
    expect(first!.rows[0]!.a!.lost).toBe(false);
    expect(first!.rows[0]!.b!.lost).toBe(true);
    expect(first!.rows[1]!.a!.lost).toBe(true);
    expect(first!.rows[2]).toMatchObject({ b: null, score: "13 - 7" });
    expect(b!.bracket).toBe("consolation");
    expect(b!.rows[0]!.a!.affiliation).toBe("(N.H.)");
  });

  it("current draw: only the open round of each bracket", () => {
    expect(printDrawSections(demo(), "current").map((x) => x.round.id)).toEqual(["r2", "b1"]);
  });
});
