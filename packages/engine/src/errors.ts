/**
 * Engine errors carry a stable code. The web app maps codes to French
 * messages (src/i18n); `details` gives the values to show.
 */
export type EngineErrorCode =
  | "NOT_FOUND"
  | "TOURNAMENT_CLOSED"
  /** Finished: only corrections and the final close are accepted. */
  | "TOURNAMENT_FINISHED"
  | "TOURNAMENT_FULL"
  | "INVALID_STATUS_CHANGE"
  | "NOT_ENOUGH_TEAMS"
  | "ROUND_INCOMPLETE"
  | "ROUND_ALREADY_DRAWN"
  | "NOTHING_TO_DRAW"
  | "ROUND_HAS_RESULTS"
  | "MATCH_NOT_PLAYABLE"
  | "MATCH_HAS_RESULT"
  | "INVALID_SCORE"
  | "DRAW_NOT_ALLOWED"
  | "TIEBREAK_REQUIRED"
  | "NEXT_MATCH_PLAYED"
  | "NEXT_ROUND_DRAWN"
  | "FINAL_PHASE_DRAWN"
  | "VENUE_BUSY"
  | "VENUE_UNAVAILABLE"
  | "SWAP_NOT_ALLOWED"
  | "NO_FREE_SLOT"
  | "TEAM_ALREADY_PLAYING"
  | "UNDO_CONFLICT"
  /** The B (or the C) is not part of this tournament. */
  | "BRACKET_DISABLED";

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    readonly details: Record<string, string | number> = {},
  ) {
    super(`${code}${Object.keys(details).length ? ` ${JSON.stringify(details)}` : ""}`);
    this.name = "EngineError";
  }
}

export function fail(code: EngineErrorCode, details?: Record<string, string | number>): never {
  throw new EngineError(code, details);
}
