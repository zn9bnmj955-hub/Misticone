import { describe, expect, it } from "vitest";
import { requireSport } from "@orgasport/sports";
import { applyCommand, createIdGenerator, defaultTournamentConfig, rulesFromSport, type EngineState } from "@orgasport/engine";
import { entityToRow, rowsToEngineState, toDbChanges } from "./engine-mapping";

function demoState(): EngineState {
  const sport = requireSport("petanque");
  const config = defaultTournamentConfig(sport);
  const s: EngineState = {
    tournament: { id: "11111111-1111-4111-8111-111111111111", status: "check_in", startsAt: "2026-10-12T12:00:00.000Z", maxTeams: 16, config },
    rules: rulesFromSport(sport, "doublette"),
    teams: {},
    players: {},
    venues: {},
    rounds: {},
    matches: {},
    teamSecrets: {},
    registrations: {},
  };
  const id = createIdGenerator("demo");
  for (let i = 1; i <= 7; i++) {
    const t = id();
    s.teams[t] = { id: t, number: i, name: null, club: i % 2 ? "Les Cigales" : null, status: "checked_in", seed: null, bracket: "main", checkedInAt: "2026-10-12T11:00:00.000Z" };
    const p = id();
    s.players[p] = { id: p, teamId: t, firstName: "Jean", lastName: `Joueur${i}`, position: 1 };
    s.teamSecrets[t] = { id: t, code: "1234" };
  }
  for (let v = 1; v <= 3; v++) {
    const vid = id();
    s.venues[vid] = { id: vid, label: String(v), position: v, reservedForFinals: false, available: true };
  }
  return s;
}

describe("engine ↔ database mapping", () => {
  it("round-trips a played state without loss", () => {
    let s = demoState();
    s = applyCommand(s, { type: "round.draw", bracket: "main", seed: "x" }, { now: "2026-10-12T12:00:00.000Z", newId: createIdGenerator("op1"), seed: "x" }).state;
    const ready = Object.values(s.matches).find((m) => m.status === "ready")!;
    s = applyCommand(s, { type: "match.score", matchId: ready.id, scoreA: 13, scoreB: 4 }, { now: "2026-10-12T12:40:00.000Z", newId: createIdGenerator("op2"), seed: "y" }).state;
    const tid = s.tournament.id;
    const rows = {
      tournament: { id: tid, status: s.tournament.status, starts_at: s.tournament.startsAt, max_teams: 16 },
      teams: Object.values(s.teams).map((e) => entityToRow("team", e as never, tid)),
      players: Object.values(s.players).map((e) => entityToRow("player", e as never, tid)),
      venues: Object.values(s.venues).map((e) => entityToRow("venue", e as never, tid)),
      rounds: Object.values(s.rounds).map((e) => entityToRow("round", e as never, tid)),
      matches: Object.values(s.matches).map((e) => entityToRow("match", e as never, tid)),
      teamSecrets: Object.values(s.teamSecrets).map((e) => entityToRow("teamSecret", e as never, tid)),
      registrations: [],
    };
    expect(rowsToEngineState(rows, s.rules, s.tournament.config)).toEqual(s);
  });

  it("updates only carry changed columns, with derived team columns", () => {
    let s = demoState();
    s = applyCommand(s, { type: "round.draw", bracket: "main", seed: "x" }, { now: "2026-10-12T12:00:00.000Z", newId: createIdGenerator("op1"), seed: "x" }).state;
    const ready = Object.values(s.matches).find((m) => m.status === "ready")!;
    const res = applyCommand(s, { type: "match.score", matchId: ready.id, scoreA: 13, scoreB: 4 }, { now: "2026-10-12T12:40:00.000Z", newId: createIdGenerator("op2"), seed: "y" });
    const db = toDbChanges(res.changes, res.state, s.tournament.id);
    const scored = db.find((c) => c.id === ready.id)!;
    expect(scored.op).toBe("update");
    expect(scored.values).toMatchObject({ score_a: 13, score_b: 4, winner_side: "A", winner_team_id: ready.sideA[0], status: "done" });
    expect(scored.values).not.toHaveProperty("round_id");
  });
});
