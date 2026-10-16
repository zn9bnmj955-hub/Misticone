import type { Bracket, EngineState, Match, Phase, PlayerClub, Round, Side, Team } from "./types";

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

/** Largest power of two lower than or equal to n (n >= 1). */
export function largestPowerOfTwo(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

export const isPowerOfTwo = (n: number) => n > 0 && (n & (n - 1)) === 0;

/**
 * Fixed brackets ("tableau fixe"): the whole tree exists from the draw. A
 * final phase drawn before the cadrage rule (lot 2) was always a whole tree:
 * its later rounds were created empty, without a seed, so it stays one.
 */
export function isFixedTree(state: EngineState, round: Round): boolean {
  if (round.phase !== "elimination" && round.phase !== "final") return false;
  if (state.tournament.config.bracketMode === "fixed") return true;
  return round.phase === "final" && roundsOf(state, round.bracket, "final").some((r) => r.seed === null);
}

/**
 * New-draw elimination round played at or after the cadrage point: no more
 * exempt, the field is brought to a power of two with places « d'office ».
 * The point is after k games of the bracket (`cadrage.afterRound`), or right
 * away for the final phase after pools.
 */
export function isAfterCadragePoint(state: EngineState, round: Round): boolean {
  if (isFixedTree(state, round)) return false;
  if (round.phase === "final") return true;
  return round.phase === "elimination" && round.number - 1 >= state.tournament.config.cadrage.afterRound;
}

/** The first round at the cadrage point (where a « Cadrage » round may be played). */
export function isAtCadragePoint(state: EngineState, round: Round): boolean {
  if (isFixedTree(state, round)) return false;
  if (round.phase === "final") return round.number === 1;
  return round.phase === "elimination" && round.number - 1 === state.tournament.config.cadrage.afterRound;
}

/** A one-sided match after the cadrage point: the team goes through « d'office » (no score). Before it, a bye is an exempt. */
export function isOfficeBye(state: EngineState, m: Match): boolean {
  const round = state.rounds[m.roundId];
  return m.status === "bye" && Boolean(round) && isAfterCadragePoint(state, round!);
}

/** Teams that start a round: the whole slots of a fixed tree, else the teams drawn (exempt and « d'office » included). */
export function teamsInRound(state: EngineState, round: Round): number {
  const ms = matchesOfRound(state, round.id);
  if (isFixedTree(state, round)) return ms.length * 2;
  return ms.reduce((n, m) => n + (m.sideA.length ? 1 : 0) + (m.sideB.length ? 1 : 0), 0);
}

/** i18n key (and number) naming a round. */
export type RoundLabel =
  | { key: "cadrage" }
  | { key: "final" | "semifinal" | "quarterfinal" | "round_of_16" | "round_of_32" | "round_of_64" | "round_of_128" }
  | { key: "partie" | "round" | "pool" | "swiss" | "league" | "melee"; n: number };

const BY_PLACES: Record<number, Exclude<RoundLabel, { n: number } | { key: "cadrage" }>["key"]> = {
  1: "final",
  2: "semifinal",
  4: "quarterfinal",
  8: "round_of_16",
  16: "round_of_32",
  32: "round_of_64",
  64: "round_of_128",
};

/**
 * Name of a round. Elimination: « Cadrage » for the round that brings the
 * field to a power of two; before the cadrage point « 1re / 2e partie »;
 * then by the places S it leaves (S = T/2 when T is a power of two, else
 * the largest power of two under T): 1 = finale, 2 = 1/2, 4 = 1/4, 8 = 8e…
 */
export function roundLabel(state: EngineState, round: Round): RoundLabel {
  if (round.phase === "pool" || round.phase === "swiss" || round.phase === "league" || round.phase === "melee") return { key: round.phase, n: round.number };
  const T = Math.max(2, teamsInRound(state, round));
  const P = largestPowerOfTwo(T);
  if (round.kind === "cadrage" || (isAtCadragePoint(state, round) && P !== T)) return { key: "cadrage" };
  if (T > 2 && !isFixedTree(state, round) && !isAfterCadragePoint(state, round)) return { key: "partie", n: round.number };
  const key = BY_PLACES[P === T ? T / 2 : P];
  return key ? { key } : { key: "round", n: round.number };
}

/** A team's club as shown next to its name: one club, « N.H. » (non homogène) or nothing known. */
export type TeamAffiliation = { kind: "club"; number: string; name: string } | { kind: "nh" } | { kind: "none" };

/** Same club when the numbers match (or, without numbers, the names). */
const clubKey = (c: PlayerClub) => (c.number.trim() ? `n:${c.number.trim()}` : `c:${c.name.trim().toUpperCase()}`);
const hasClub = (c: PlayerClub | null | undefined): c is PlayerClub => Boolean(c && (c.number.trim() || c.name.trim()));

/**
 * Affiliation from the players' clubs: every player of the same club → that
 * club; at least two different clubs → « N.H. »; otherwise (no information,
 * or some players unknown) → none, and the club typed by hand applies.
 */
export function affiliationOf(clubs: (PlayerClub | null | undefined)[]): TeamAffiliation {
  const known = clubs.filter(hasClub);
  if (new Set(known.map(clubKey)).size >= 2) return { kind: "nh" };
  if (known.length === 0 || known.length < clubs.length) return { kind: "none" };
  return { kind: "club", number: known[0]!.number.trim(), name: known[0]!.name.trim() };
}

export function teamAffiliation(state: EngineState, teamId: string): TeamAffiliation {
  return affiliationOf(Object.values(state.players).filter((p) => p.teamId === teamId).map((p) => p.club));
}

/** Value of `team.club` (used by « même club évité »): the common club, none for N.H., else the club typed by hand. */
export function teamClubFrom(affiliation: TeamAffiliation, typed: string | null): string | null {
  if (affiliation.kind === "club") return affiliation.name || affiliation.number;
  if (affiliation.kind === "nh") return null;
  return typed;
}
