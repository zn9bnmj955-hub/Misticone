import { compareRounds, isFinalPhaseMatch } from "./bracket";
import { ACTIVE_ON_VENUE, isFinished } from "./queries";
import type { Transaction } from "./tx";
import type { CompetitionFormat, EngineContext, EngineState, Match, SportRules } from "./types";

const MINUTE = 60_000;

export function slotMinutes(rules: SportRules): number {
  const play = rules.scoring.mode === "time" ? rules.scoring.durationMinutes : rules.typicalMatchMinutes;
  return play + rules.changeoverMinutes;
}

/** Waiting matches, first come first served, then by round and position. */
export function venueQueue(state: EngineState): Match[] {
  return Object.values(state.matches)
    .filter((m) => m.status === "waiting_venue")
    .sort((a, b) => {
      const qa = a.queuedAt ?? "";
      const qb = b.queuedAt ?? "";
      if (qa !== qb) return qa < qb ? -1 : 1;
      const c = compareRounds(state.rounds[a.roundId]!, state.rounds[b.roundId]!);
      return c || (a.pool ?? "").localeCompare(b.pool ?? "") || a.position - b.position;
    });
}

const teamsOf = (m: Match) => [...m.sideA, ...m.sideB];

/**
 * Gives a venue to every waiting match that can have one.
 * - "parallel" (pétanque): a venue holds one match at a time; a match gets
 *   a venue as soon as one is free. Reserved venues only host final-phase
 *   matches.
 * - "scheduled" (football): venues are reused in time slots; each match gets
 *   the earliest slot where the venue and both teams are free.
 */
export function autoAssignVenues(tx: Transaction, ctx: EngineContext): void {
  const state = tx.state;
  const queue = venueQueue(state);
  const venues = Object.values(state.venues)
    .filter((v) => v.available)
    .sort((a, b) => a.position - b.position);
  if (venues.length === 0) return;

  if (state.rules.venueUsage === "parallel") {
    const busyVenues = new Set<string>();
    const busyTeams = new Set<string>();
    // Matches being played keep their venue; a "ready" match whose team or
    // venue is taken elsewhere (after a manual change) goes back to the queue.
    const active = Object.values(state.matches)
      .filter((m) => ACTIVE_ON_VENUE.has(m.status))
      .sort((a, b) => (a.status === "ready" ? 1 : 0) - (b.status === "ready" ? 1 : 0) || (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
    const requeued: Match[] = [];
    for (const m of active) {
      const clash = (m.venueId && busyVenues.has(m.venueId)) || teamsOf(m).some((t) => busyTeams.has(t)) || !m.venueId;
      if (clash && m.status === "ready") {
        tx.update("match", m.id, { status: "waiting_venue", venueId: null, scheduledAt: null });
        requeued.push(tx.state.matches[m.id]!);
        continue;
      }
      if (m.venueId) busyVenues.add(m.venueId);
      teamsOf(m).forEach((t) => busyTeams.add(t));
    }
    const fullQueue = requeued.length ? venueQueue(tx.state) : queue;
    for (const m of fullQueue) {
      if (teamsOf(m).some((t) => busyTeams.has(t))) continue;
      const final = isFinalPhaseMatch(state, m);
      const free = venues.filter((v) => !busyVenues.has(v.id) && (final || !v.reservedForFinals));
      if (free.length === 0) continue;
      // Finals go to the reserved (show) venues first.
      const venue = (final && free.find((v) => v.reservedForFinals)) || free[0]!;
      tx.update("match", m.id, { venueId: venue.id, status: "ready", scheduledAt: ctx.now });
      busyVenues.add(venue.id);
      teamsOf(m).forEach((t) => busyTeams.add(t));
    }
    return;
  }

  if (queue.length === 0) return;
  // Scheduled usage.
  const slot = slotMinutes(state.rules) * MINUTE;
  const now = new Date(ctx.now).getTime();
  const venueFree = new Map<string, number>(venues.map((v) => [v.id, now]));
  const teamFree = new Map<string, number>();
  for (const m of Object.values(state.matches)) {
    if (isFinished(m) || !m.scheduledAt || !m.venueId) continue;
    const end = new Date(m.scheduledAt).getTime() + slot;
    if (venueFree.has(m.venueId)) venueFree.set(m.venueId, Math.max(venueFree.get(m.venueId)!, end));
    teamsOf(m).forEach((t) => teamFree.set(t, Math.max(teamFree.get(t) ?? 0, end)));
  }
  const start = state.tournament.startsAt ? new Date(state.tournament.startsAt).getTime() : now;
  for (const m of queue) {
    const final = isFinalPhaseMatch(state, m);
    const candidates = venues.filter((v) => final || !v.reservedForFinals);
    if (candidates.length === 0) continue;
    const teamsReady = Math.max(start, ...teamsOf(m).map((t) => teamFree.get(t) ?? 0));
    let best: { id: string; at: number } | null = null;
    for (const v of candidates) {
      const at = Math.max(venueFree.get(v.id)!, teamsReady);
      if (!best || at < best.at) best = { id: v.id, at };
    }
    tx.update("match", m.id, { venueId: best!.id, status: "ready", scheduledAt: new Date(best!.at).toISOString() });
    venueFree.set(best!.id, best!.at + slot);
    teamsOf(m).forEach((t) => teamFree.set(t, best!.at + slot));
  }
}

/** Position of a match in the venue queue (1 = next), or null. */
export function queuePosition(state: EngineState, matchId: string): number | null {
  const i = venueQueue(state).findIndex((m) => m.id === matchId);
  return i === -1 ? null : i + 1;
}

// ---------------------------------------------------------------------------
// Planning estimate (creation form and "Terrains" screen)
// ---------------------------------------------------------------------------

export interface PlanInput {
  teams: number;
  format: CompetitionFormat;
  venues: number;
  rules: SportRules;
  startAt: string;
  rounds?: number | null;
  poolSize?: number;
  poolSystem?: "gsl" | "round_robin";
  poolQualifiers?: number;
  consolation?: boolean;
}

export interface PlanRound {
  index: number;
  kind: "pool" | "elimination" | "swiss" | "league" | "melee";
  matches: number;
  waves: number;
  start: string;
  end: string;
}

export interface Plan {
  rounds: PlanRound[];
  /** Venues needed to play the whole first round at once. */
  firstRoundVenuesNeeded: number;
  /** First-round matches that will start later for lack of venues. */
  firstRoundDelayed: number;
  end: string;
  totalMatches: number;
}

function eliminationRoundMatches(teams: number): number[] {
  const out: number[] = [];
  let n = teams;
  while (n > 1) {
    out.push(Math.floor(n / 2));
    n = Math.ceil(n / 2);
  }
  return out;
}

/** Rough timetable: rounds are played in waves when venues are short. */
export function estimatePlan(input: PlanInput): Plan {
  const venues = Math.max(1, input.venues);
  const slot = slotMinutes(input.rules);
  let perRound: { kind: PlanRound["kind"]; matches: number }[] = [];
  const n = Math.max(0, input.teams);

  if (input.format === "single_elimination") {
    const main = eliminationRoundMatches(n);
    const cons = input.consolation ? eliminationRoundMatches(main[0] ?? 0) : [];
    perRound = main.map((m, i) => ({ kind: "elimination", matches: m + (i >= 1 ? cons[i - 1] ?? 0 : 0) }));
    // Consolation rounds that outlast the main bracket.
    for (let i = main.length; i <= cons.length; i++) perRound.push({ kind: "elimination", matches: cons[i - 1] ?? 0 });
  } else if (input.format === "pools_then_bracket") {
    const size = input.poolSize ?? 4;
    const pools = Math.max(1, Math.ceil(n / size));
    const perPoolRounds = input.poolSystem === "round_robin" ? [size - 1, (size * (size - 1)) / 2] : [3, 5];
    const roundCount = input.poolSystem === "round_robin" ? perPoolRounds[0]! : 3;
    const gsl = [2, 2, 1];
    for (let r = 0; r < roundCount; r++) {
      const matches = input.poolSystem === "round_robin" ? pools * Math.floor(size / 2) : pools * gsl[r]!;
      perRound.push({ kind: "pool", matches });
    }
    const qualified = pools * (input.poolQualifiers ?? 2);
    for (const m of eliminationRoundMatches(qualified)) perRound.push({ kind: "elimination", matches: m });
  } else if (input.format === "round_robin") {
    const rounds = n % 2 === 0 ? n - 1 : n;
    for (let r = 0; r < rounds; r++) perRound.push({ kind: "league", matches: Math.floor(n / 2) });
  } else if (input.format === "swiss") {
    const rounds = input.rounds ?? Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
    for (let r = 0; r < rounds; r++) perRound.push({ kind: "swiss", matches: Math.floor(n / 2) });
  } else {
    const per = Math.max(1, input.rules.teamSize * 2);
    const rounds = input.rounds ?? 4;
    for (let r = 0; r < rounds; r++) perRound.push({ kind: "melee", matches: Math.floor(n / per) });
  }
  perRound = perRound.filter((r) => r.matches > 0);

  let t = new Date(input.startAt).getTime();
  const rounds: PlanRound[] = perRound.map((r, i) => {
    const waves = Math.ceil(r.matches / venues);
    const start = t;
    t += waves * slot * MINUTE;
    return { index: i + 1, kind: r.kind, matches: r.matches, waves, start: new Date(start).toISOString(), end: new Date(t).toISOString() };
  });
  const first = perRound[0]?.matches ?? 0;
  return {
    rounds,
    firstRoundVenuesNeeded: first,
    firstRoundDelayed: Math.max(0, first - venues),
    end: new Date(t).toISOString(),
    totalMatches: perRound.reduce((s, r) => s + r.matches, 0),
  };
}
