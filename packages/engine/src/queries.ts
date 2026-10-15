import type { Bracket, EngineState, Match, Phase, Round, Side, Team } from "./types";

/** Read-only helpers over the engine state. */

export const FINISHED: ReadonlySet<Match["status"]> = new Set(["done", "forfeit", "bye"]);
export const ACTIVE_ON_VENUE: ReadonlySet<Match["status"]> = new Set(["ready", "playing", "score_submitted", "disputed"]);

export const isFinished = (m: Match) => FINISHED.has(m.status);
export const hasResult = (m: Match) => m.status === "done" || m.status === "forfeit";

export function roundsOf(state: EngineState, bracket?: Bracket, phase?: Phase): Round[] {
  return Object.values(state.rounds)
    .filter((r) => (bracket === undefined || r.bracket === bracket) && (phase === undefined || r.phase === phase))
    .sort((a, b) => a.number - b.number);
}

export function matchesOfRound(state: EngineState, roundId: string): Match[] {
  return Object.values(state.matches)
    .filter((m) => m.roundId === roundId)
    .sort((a, b) => (a.pool ?? "").localeCompare(b.pool ?? "") || a.position - b.position);
}

export function lastRound(state: EngineState, bracket: Bracket, phase?: Phase): Round | undefined {
  const list = roundsOf(state, bracket, phase);
  return list[list.length - 1];
}

export function isRoundComplete(state: EngineState, roundId: string): boolean {
  const ms = matchesOfRound(state, roundId);
  return ms.length > 0 && ms.every(isFinished);
}

export function sideTeams(m: Match, side: Side): string[] {
  return side === "A" ? m.sideA : m.sideB;
}

export function winnerTeams(m: Match): string[] {
  if (m.winner === "A") return m.sideA;
  if (m.winner === "B") return m.sideB;
  return [];
}

export function loserTeams(m: Match): string[] {
  if (m.status === "bye") return [];
  if (m.winner === "A") return m.sideB;
  if (m.winner === "B") return m.sideA;
  if (m.status === "forfeit" && m.winner === null) return [...m.sideA, ...m.sideB];
  return [];
}

export function teamMatches(state: EngineState, teamId: string): Match[] {
  return Object.values(state.matches).filter((m) => m.sideA.includes(teamId) || m.sideB.includes(teamId));
}

/** Teams taking part in draws: checked-in ones; if nobody was checked in, registered ones. */
export function eligibleTeams(state: EngineState): Team[] {
  const all = Object.values(state.teams);
  const checked = all.filter((t) => t.status === "checked_in");
  const pool = checked.length > 0 ? checked : all.filter((t) => t.status === "registered");
  return pool.sort((a, b) => a.number - b.number);
}

/** Registered teams left out of the next draw because others were checked in and they were not. */
export function teamsLeftOut(state: EngineState): Team[] {
  const all = Object.values(state.teams);
  if (!all.some((t) => t.status === "checked_in")) return [];
  return all.filter((t) => t.status === "registered").sort((a, b) => a.number - b.number);
}

/** Status to restore when a forfeit is cancelled: checked in again if the team had been checked in. */
export function statusBeforeForfeit(team: Team): "checked_in" | "registered" {
  return team.checkedInAt ? "checked_in" : "registered";
}

export function teamsById(state: EngineState, ids: string[]): Team[] {
  return ids.map((id) => state.teams[id]).filter((t): t is Team => Boolean(t));
}

/** Set of "a|b" keys for every pair of teams that already met. */
export function playedPairs(state: EngineState, bracket?: Bracket): Set<string> {
  const set = new Set<string>();
  for (const m of Object.values(state.matches)) {
    if (bracket && state.rounds[m.roundId]?.bracket !== bracket) continue;
    for (const a of m.sideA) for (const b of m.sideB) set.add(pairKey(a, b));
  }
  return set;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function byeCount(state: EngineState, teamId: string, bracket?: Bracket): number {
  return Object.values(state.matches).filter(
    (m) => m.status === "bye" && m.sideA.includes(teamId) && (!bracket || state.rounds[m.roundId]?.bracket === bracket),
  ).length;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}
