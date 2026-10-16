import { describe, expect, it } from "vitest";
import { requireSport } from "@orgasport/sports";
import { applyCommand, createIdGenerator, type EngineState } from "@orgasport/engine";
import { renderBody } from "./templates";
import { eventsFromChanges } from "./events";

describe("notification texts", () => {
  it("pétanque: the message of the spec", () => {
    expect(
      renderBody(requireSport("petanque"), "your_turn", { venue: "12", time: "15 h 40", opponent: "l'équipe 27 (Dupont / Martin)" }),
    ).toBe("À vous ! Terrain 12 · 15 h 40 · contre l'équipe 27 (Dupont / Martin)");
  });
  it("football: minutes before kick-off", () => {
    expect(renderBody(requireSport("football"), "your_turn", { minutes: 10, venue: "2", opponent: "l'équipe 4 (FC Test)" })).toBe(
      "Match dans 10 min, Terrain 2 · contre l'équipe 4 (FC Test)",
    );
  });
  it("missing values never leave placeholders", () => {
    expect(renderBody(requireSport("petanque"), "your_turn", { venue: "3" })).toBe("À vous ! Terrain 3 · contre");
  });
});

function tournament(teams: number, venues: number): EngineState {
  const sport = requireSport("petanque");
  const state: EngineState = {
    tournament: {
      id: "t",
      status: "published",
      startsAt: "2026-10-24T12:30:00Z",
      maxTeams: null,
      config: {
        format: "single_elimination",
        bracketMode: "redraw",
        rounds: null,
        cadrage: { afterRound: 1 },
        consolation: { enabled: false, source: "losers_round_1", entry: "auto", feeCents: null, losersOfRound: 1 },
        consolationC: { enabled: false, entry: "auto", feeCents: null },
        pause: null,
        draw: { avoidSameClubFirstRound: false, seeding: false },
        pools: { size: 4, qualifiers: 2, system: "gsl" },
        autoNextRound: true,
        autoDrawAt: null,
        scoreEntry: "table",
        reservedVenuesFrom: "semifinal",
        forfeitScore: { winner: 13, loser: 0 },
        byeScore: { winner: 13, loser: 0 },
        ranking: ["wins"],
      },
    },
    rules: {
      scoring: sport.scoring as EngineState["rules"]["scoring"],
      venueUsage: "parallel",
      typicalMatchMinutes: 50,
      changeoverMinutes: 5,
      ranking: ["wins"],
      matchPoints: { win: 1, draw: 0, loss: 0 },
      teamSize: 2,
    },
    teams: {},
    players: {},
    venues: {},
    rounds: {},
    matches: {},
    teamSecrets: {},
    registrations: {},
  };
  let s = state;
  const run = (cmd: Parameters<typeof applyCommand>[1], op: string) => {
    const r = applyCommand(s, cmd, { now: "2026-10-24T12:30:00Z", newId: createIdGenerator(op), seed: op });
    s = r.state;
    return r;
  };
  for (let v = 1; v <= venues; v++) run({ type: "venue.add", label: String(v) }, `v${v}`);
  for (let i = 1; i <= teams; i++) run({ type: "team.create", players: [{ firstName: "A", lastName: `T${i}` }, { firstName: "B", lastName: `T${i}` }] }, `t${i}`);
  return Object.assign(s, { __run: run });
}

describe("events from engine changes", () => {
  it("a draw publishes the round and notifies teams that got a venue", () => {
    const s = tournament(8, 3) as EngineState & { __run: (c: unknown, op: string) => { state: EngineState; changes: never[] } };
    const r = s.__run({ type: "round.draw", bracket: "main", seed: "x" }, "draw");
    const events = eventsFromChanges(r.changes, r.state);
    const draw = events.filter((e) => e.kind === "draw_published");
    const turns = events.filter((e) => e.kind === "your_turn");
    expect(draw).toHaveLength(1);
    expect(draw[0]!.teamIds).toHaveLength(8);
    // 4 matches, 3 venues: 3 matches ready (6 teams), 1 waiting.
    expect(turns).toHaveLength(3);
    expect(new Set(turns.flatMap((t) => t.teamIds)).size).toBe(6);
  });

  it("a score frees a venue: the waiting match becomes ready, the score is validated", () => {
    const s = tournament(8, 3) as EngineState & { __run: (c: unknown, op: string) => { state: EngineState; changes: never[] } };
    const drawn = s.__run({ type: "round.draw", bracket: "main", seed: "x" }, "draw");
    const playing = Object.values(drawn.state.matches).find((m) => m.status === "ready")!;
    const r = s.__run({ type: "match.score", matchId: playing.id, scoreA: 13, scoreB: 7 }, "score");
    const kinds = eventsFromChanges(r.changes, r.state).map((e) => e.kind).sort();
    expect(kinds).toEqual(["score_validated", "your_turn"]);
  });

  it("is deterministic: same changes, same keys", () => {
    const s = tournament(4, 2) as EngineState & { __run: (c: unknown, op: string) => { state: EngineState; changes: never[] } };
    const r = s.__run({ type: "round.draw", bracket: "main", seed: "x" }, "draw");
    expect(eventsFromChanges(r.changes, r.state).map((e) => e.key)).toEqual(eventsFromChanges(r.changes, r.state).map((e) => e.key));
  });
});
