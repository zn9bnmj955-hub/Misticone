import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultTournamentConfig, rulesFromSport, type EngineState, type Match } from "@orgasport/engine";
import { requireSport } from "@orgasport/sports";
import type { ScoringTable } from "./store";
import { VenuesTab } from "./tabs";

const match = (id: string, status: Match["status"], venueId: string | null): Match =>
  ({
    id, roundId: "r1", position: 1, pool: null, sideA: ["t1"], sideB: ["t2"], venueId, scheduledAt: null, startedAt: null, endedAt: null,
    queuedAt: null, scoreA: null, scoreB: null, tiebreakA: null, tiebreakB: null, winner: null, status,
  }) as Match;

function state(matches: Match[]): EngineState {
  const sport = requireSport("petanque");
  return {
    tournament: { id: "x", status: "live", startsAt: null, maxTeams: null, config: defaultTournamentConfig(sport) },
    rules: rulesFromSport(sport),
    registrations: {},
    teams: {},
    players: {},
    rounds: { r1: { id: "r1", bracket: "main", phase: "elimination", number: 1, status: "live", seed: null, drawnAt: null } },
    matches: Object.fromEntries(matches.map((x) => [x.id, x])),
    venues: { v1: { id: "v1", label: "1", position: 1, reservedForFinals: false, available: true } },
    teamSecrets: {},
  } as unknown as EngineState;
}

const render = (s: EngineState) =>
  renderToStaticMarkup(createElement(VenuesTab, { table: { dispatch: () => {} } as unknown as ScoringTable, state: s, sportSlug: "petanque" }))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

describe("scoring table, venues tab", () => {
  it("shows the remaining matches, never an estimated end time", () => {
    const text = render(state([match("m1", "playing", "v1"), match("m2", "pending", null), match("m3", "done", null)]));
    expect(text).toContain("2 match(s) restant(s).");
    expect(text).not.toMatch(/fin|estim|\d{1,2} h \d{2}|\d{1,2}:\d{2}/i);
  });

  it("says nothing about remaining matches when everything is played", () => {
    expect(render(state([match("m1", "done", null)]))).not.toContain("restant");
  });
});
