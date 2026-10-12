import { fail } from "./errors";
import type { ScoringRules, Winner } from "./types";

export interface ScoreInput {
  scoreA: number;
  scoreB: number;
  tiebreakA?: number | null;
  tiebreakB?: number | null;
}

/**
 * Checks a final score against the sport rules and returns the winner.
 * `knockout` = the match must have a winner (elimination, final phase).
 */
export function resolveScore(scoring: ScoringRules, input: ScoreInput, knockout: boolean): Winner {
  const { scoreA: a, scoreB: b } = input;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) fail("INVALID_SCORE");

  if (scoring.mode === "points") {
    const t = scoring.target;
    if (a > t || b > t) fail("INVALID_SCORE", { max: t });
    if (a === b) fail("DRAW_NOT_ALLOWED");
    // Without a time limit, the winner must reach the target.
    if (scoring.timeLimitMinutes === null && Math.max(a, b) !== t) fail("INVALID_SCORE", { target: t });
    return a > b ? "A" : "B";
  }

  if (scoring.mode === "sets") {
    const w = scoring.setsToWin;
    if (Math.max(a, b) !== w || Math.min(a, b) >= w) fail("INVALID_SCORE", { target: w });
    return a > b ? "A" : "B";
  }

  // Time-based (football…)
  if (a !== b) return a > b ? "A" : "B";
  if (!knockout && scoring.allowDraw) return "draw";
  const ta = input.tiebreakA;
  const tb = input.tiebreakB;
  if (ta == null || tb == null) fail("TIEBREAK_REQUIRED");
  if (!Number.isInteger(ta) || !Number.isInteger(tb) || ta < 0 || tb < 0 || ta === tb) fail("INVALID_SCORE");
  return ta > tb ? "A" : "B";
}
