import { fail } from "./errors";
import { FINISHED, isFixedTree, matchesOfRound, roundsOf, teamsInRound, winnerTeams } from "./queries";
import type { Transaction } from "./tx";
import type { EngineContext, EngineState, Match, Phase, Round } from "./types";

export { isFixedTree, teamsInRound };

/**
 * Fixed brackets ("tableau fixe"): the whole tree exists from the draw. The
 * match at round r, position p is fed by round r-1, positions 2p-1 and 2p.
 */

export const PHASE_RANK: Record<Phase, number> = { pool: 0, league: 0, swiss: 0, melee: 0, elimination: 1, final: 2 };

const BRACKET_RANK: Record<Round["bracket"], number> = { main: 0, consolation: 1, consolation_c: 2 };

/** Chronological order of rounds: A, then B, then C; pools before finals, then number. */
export function roundOrderKey(r: Round): [number, number, number] {
  return [BRACKET_RANK[r.bracket], PHASE_RANK[r.phase], r.number];
}

export function compareRounds(a: Round, b: Round): number {
  const ka = roundOrderKey(a);
  const kb = roundOrderKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
}

function sibling(state: EngineState, round: Round, offset: number): Round | undefined {
  return roundsOf(state, round.bracket, round.phase).find((r) => r.number === round.number + offset);
}

function matchAt(state: EngineState, round: Round, position: number): Match | undefined {
  return matchesOfRound(state, round.id).find((m) => m.position === position);
}

export function parentOf(state: EngineState, m: Match): { parent: Match; side: "A" | "B" } | null {
  const round = state.rounds[m.roundId]!;
  const next = sibling(state, round, 1);
  if (!next) return null;
  const parent = matchAt(state, next, Math.ceil(m.position / 2));
  return parent ? { parent, side: m.position % 2 === 1 ? "A" : "B" } : null;
}

export function feedersOf(state: EngineState, m: Match): [Match | undefined, Match | undefined] {
  const round = state.rounds[m.roundId]!;
  const prev = sibling(state, round, -1);
  if (!prev) return [undefined, undefined];
  return [matchAt(state, prev, m.position * 2 - 1), matchAt(state, prev, m.position * 2)];
}

/**
 * Recomputes the status of a fixed-tree match from its feeders: pending,
 * playable, a walkover (one side only) or void (nobody qualified).
 */
export function resolveFixedMatch(tx: Transaction, matchId: string, ctx: EngineContext): void {
  const m = tx.state.matches[matchId]!;
  if (m.status === "done" || m.status === "forfeit" || m.status === "playing") return;
  const [f1, f2] = feedersOf(tx.state, m);
  if (!f1 || !f2) return;
  const bothFinished = FINISHED.has(f1.status) && FINISHED.has(f2.status);
  const hasA = m.sideA.length > 0;
  const hasB = m.sideB.length > 0;
  const round = tx.state.rounds[m.roundId]!;

  if (!bothFinished) {
    if (m.status !== "pending") tx.update("match", m.id, { status: "pending", winner: null, venueId: null, scheduledAt: null, queuedAt: null });
    return;
  }
  if (round.status === "pending") tx.update("round", round.id, { status: "drawn", drawnAt: ctx.now });
  if (hasA && hasB) {
    if (m.status === "pending" || m.status === "bye")
      tx.update("match", m.id, { status: "waiting_venue", winner: null, queuedAt: ctx.now });
    return;
  }
  // One side or nobody: walkover, then keep propagating.
  const winner = hasA ? "A" : hasB ? "B" : null;
  if (hasB && !hasA) {
    // Keep the convention "bye = side A plays alone".
    tx.update("match", m.id, { sideA: m.sideB, sideB: [] });
  }
  tx.update("match", m.id, { status: winner ? "bye" : "forfeit", winner: winner ? "A" : null, venueId: null, scheduledAt: null });
  propagateFixed(tx, m.id, ctx);
}

/** A match decided without being played: a bye, or nobody qualified for it. */
export function isWalkover(m: Match): boolean {
  return m.status === "bye" || (m.status === "forfeit" && m.winner === null && m.sideA.length + m.sideB.length <= 1);
}

/** Sends the result of a finished fixed-tree match to its parent. */
export function propagateFixed(tx: Transaction, matchId: string, ctx: EngineContext): void {
  const m = tx.state.matches[matchId]!;
  const link = parentOf(tx.state, m);
  if (!link) return;
  const { parent, side } = link;
  if (!isWalkover(parent) && ["done", "forfeit", "playing", "score_submitted", "disputed"].includes(parent.status)) {
    fail("NEXT_MATCH_PLAYED", { match: parent.position });
  }
  if (isWalkover(parent)) {
    unpropagateFixed(tx, parent.id, ctx);
    tx.update("match", parent.id, { status: "pending", winner: null });
  }
  // Rebuild both sides from the feeders (positional), which also undoes the
  // "bye plays as side A" normalisation of an earlier walkover.
  void side;
  const [f1, f2] = feedersOf(tx.state, tx.state.matches[parent.id]!);
  tx.update("match", parent.id, {
    sideA: f1 && FINISHED.has(f1.status) ? winnerTeams(f1) : [],
    sideB: f2 && FINISHED.has(f2.status) ? winnerTeams(f2) : [],
  });
  resolveFixedMatch(tx, parent.id, ctx);
}

/**
 * Removes the contribution of a match whose result is cancelled: its parent
 * goes back to "pending". Fails if the parent was already played.
 */
export function unpropagateFixed(tx: Transaction, matchId: string, ctx: EngineContext): void {
  const m = tx.state.matches[matchId]!;
  const link = parentOf(tx.state, m);
  if (!link) return;
  const { parent, side } = link;
  const wasWalkover = isWalkover(parent);
  if (!wasWalkover && ["done", "forfeit", "playing", "score_submitted", "disputed"].includes(parent.status)) {
    fail("NEXT_MATCH_PLAYED", { match: parent.position });
  }
  if (wasWalkover) unpropagateFixed(tx, parent.id, ctx);
  // Restore positional sides (a walkover may have moved B to A).
  const [f1, f2] = feedersOf(tx.state, parent);
  const sideA = f1 && FINISHED.has(f1.status) && f1.id !== m.id ? winnerTeams(f1) : [];
  const sideB = f2 && FINISHED.has(f2.status) && f2.id !== m.id ? winnerTeams(f2) : [];
  void side;
  tx.update("match", parent.id, { sideA, sideB, status: "pending", winner: null, venueId: null, scheduledAt: null, queuedAt: null });
}

export type Stage = "final" | "semifinal" | "quarterfinal" | "round_of_16" | "round";

export function stageOf(state: EngineState, round: Round): Stage {
  if (round.phase !== "elimination" && round.phase !== "final") return "round";
  const n = teamsInRound(state, round);
  if (n <= 2) return "final";
  if (n <= 4) return "semifinal";
  if (n <= 8) return "quarterfinal";
  if (n <= 16) return "round_of_16";
  return "round";
}

/** May this match use venues reserved for the finals? */
export function isFinalPhaseMatch(state: EngineState, m: Match): boolean {
  const round = state.rounds[m.roundId];
  if (!round || round.bracket !== "main") return false;
  const stage = stageOf(state, round);
  return state.tournament.config.reservedVenuesFrom === "final" ? stage === "final" : stage === "final" || stage === "semifinal";
}
