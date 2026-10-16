import type { Plan } from "@orgasport/engine";
import type { SportConfig } from "@orgasport/sports";
import { DATE_RE, TIME_RE, planFor, type TournamentForm } from "@/lib/tournament-form";

/** The engine's plan, or null while the date or the start time is being typed. */
export function safePlan(form: TournamentForm, sport: SportConfig, teams = form.maxTeams): Plan | null {
  if (!DATE_RE.test(form.date) || !TIME_RE.test(form.startTime)) return null;
  try {
    return planFor(form, sport, teams);
  } catch {
    return null;
  }
}

/**
 * Figures shown under the venues step. Counts only: no end time and no
 * duration are ever shown (games last as long as they last).
 */
export type PlanSummary = {
  /** Venues usable from the first round (reserved ones excluded). */
  free: number;
  reserved: number;
  needed: number;
  delayed: number;
  matches: number;
  /** Time slots in a row on the venues (scheduled sports). */
  slots: number;
};

export function summarizePlan(form: TournamentForm, plan: Plan): PlanSummary {
  return {
    free: Math.max(1, form.venueCount - form.reservedLabels.length),
    reserved: form.reservedLabels.length,
    needed: plan.firstRoundVenuesNeeded,
    delayed: plan.firstRoundDelayed,
    matches: plan.totalMatches,
    slots: plan.rounds.reduce((sum, r) => sum + r.waves, 0),
  };
}
