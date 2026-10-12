import { requireSport, sportConfigSchema, type SportConfigInput } from "@orgasport/sports";
import { applyCommand, type Command } from "./commands";
import { defaultTournamentConfig, rulesFromSport } from "./config";
import { canDrawNext } from "./formats";
import { createIdGenerator, createRng } from "./rng";
import type { EngineState, Match, TournamentConfig } from "./types";

/** Test-only helpers (not exported by the package). */

export interface MakeStateOptions {
  teams: number;
  sport?: string;
  sportConfig?: SportConfigInput;
  teamFormat?: string;
  venues?: number;
  reservedVenues?: number;
  clubs?: (i: number) => string | null;
  seeds?: (i: number) => number | null;
  config?: Partial<TournamentConfig>;
  status?: EngineState["tournament"]["status"];
  maxTeams?: number | null;
  teamStatus?: "checked_in" | "registered";
}

export function makeState(o: MakeStateOptions): EngineState {
  const sport = o.sportConfig ? sportConfigSchema.parse(o.sportConfig) : requireSport(o.sport ?? "petanque");
  const config: TournamentConfig = { ...defaultTournamentConfig(sport), ...o.config };
  const state: EngineState = {
    tournament: { id: "t1", status: o.status ?? "check_in", startsAt: "2026-10-12T12:00:00.000Z", maxTeams: o.maxTeams ?? null, config },
    rules: rulesFromSport(sport, o.teamFormat),
    teams: {},
    players: {},
    venues: {},
    rounds: {},
    matches: {},
    teamSecrets: {},
    registrations: {},
  };
  for (let i = 1; i <= o.teams; i++) {
    const id = `team-${String(i).padStart(3, "0")}`;
    state.teams[id] = {
      id,
      number: i,
      name: null,
      club: o.clubs ? o.clubs(i) : null,
      status: o.teamStatus ?? "checked_in",
      seed: o.seeds ? o.seeds(i) : null,
      bracket: "main",
      checkedInAt: "2026-10-12T11:00:00.000Z",
    };
  }
  const venues = o.venues ?? 100;
  for (let v = 1; v <= venues; v++) {
    const id = `venue-${String(v).padStart(3, "0")}`;
    state.venues[id] = { id, label: String(v), position: v, reservedForFinals: v > venues - (o.reservedVenues ?? 0), available: true };
  }
  return state;
}

let opCounter = 0;
export function resetOps() {
  opCounter = 0;
}

/** Applies a command with a deterministic context; time advances one minute per call. */
export function exec(state: EngineState, cmd: Command, opId = `op-${++opCounter}`): EngineState {
  const minute = opCounter;
  const now = new Date(Date.UTC(2026, 9, 12, 12, 0) + minute * 60_000).toISOString();
  return applyCommand(state, cmd, { now, newId: createIdGenerator(opId), seed: `seed-${opId}` }).state;
}

export const PLAYABLE_STATUSES = new Set<Match["status"]>(["waiting_venue", "ready", "playing"]);

/** A valid random final score for the sport. */
export function randomScore(state: EngineState, rnd: () => number, knockout: boolean): { scoreA: number; scoreB: number; tiebreakA?: number; tiebreakB?: number } {
  const s = state.rules.scoring;
  if (s.mode === "points") {
    const loser = Math.floor(rnd() * s.target);
    return rnd() < 0.5 ? { scoreA: s.target, scoreB: loser } : { scoreA: loser, scoreB: s.target };
  }
  if (s.mode === "sets") {
    const loser = Math.floor(rnd() * s.setsToWin);
    return rnd() < 0.5 ? { scoreA: s.setsToWin, scoreB: loser } : { scoreA: loser, scoreB: s.setsToWin };
  }
  const a = Math.floor(rnd() * 4);
  const b = Math.floor(rnd() * 4);
  if (a === b && knockout) return { scoreA: a, scoreB: b, tiebreakA: 5, tiebreakB: 4 };
  return { scoreA: a, scoreB: b };
}

/**
 * Plays the tournament to the end with random results: scores every
 * playable match, draws when needed. Returns the final state.
 */
export function playToEnd(start: EngineState, seed = "play", opts: { maxSteps?: number; manualDraw?: boolean } = {}): EngineState {
  const rng = createRng(seed);
  let state = start;
  if (!Object.values(state.rounds).some((r) => r.bracket === "main")) {
    state = exec(state, { type: "round.draw", bracket: "main", seed: `${seed}-first` });
  }
  for (let step = 0; step < (opts.maxSteps ?? 5000); step++) {
    const playable = Object.values(state.matches)
      .filter((m) => PLAYABLE_STATUSES.has(m.status))
      .sort((a, b) => (a.queuedAt ?? "").localeCompare(b.queuedAt ?? "") || a.position - b.position);
    const m = playable[0];
    if (m) {
      const round = state.rounds[m.roundId]!;
      const knockout = round.phase === "elimination" || round.phase === "final";
      state = exec(state, { type: "match.score", matchId: m.id, ...randomScore(state, () => rng.next(), knockout) });
      continue;
    }
    if (canDrawNext(state, "main")) {
      state = exec(state, { type: "round.draw", bracket: "main", seed: `${seed}-${step}` });
      continue;
    }
    if (canDrawNext(state, "consolation")) {
      state = exec(state, { type: "round.draw", bracket: "consolation", seed: `${seed}-c${step}` });
      continue;
    }
    return state;
  }
  throw new Error("tournament did not finish");
}
