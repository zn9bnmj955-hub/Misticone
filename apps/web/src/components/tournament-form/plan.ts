import { rulesFromSport, slotMinutes, type Plan } from "@orgasport/engine";
import type { SportConfig } from "@orgasport/sports";
import { DATE_RE, TIME_RE, isoToParis, parisToIso, planFor, storedConfig, type TournamentForm } from "@/lib/tournament-form";

/** Past this local time, a one-day competition is considered late (same rule as the advisor). */
export const LATE_END = "21:00";

/** The engine's estimate, or null while the date or the start time is being typed. */
export function safePlan(form: TournamentForm, sport: SportConfig, teams = form.maxTeams): Plan | null {
  if (!DATE_RE.test(form.date) || !TIME_RE.test(form.startTime)) return null;
  try {
    return planFor(form, sport, teams);
  } catch {
    return null;
  }
}

export type PlanSummary = {
  /** Venues usable from the first round (reserved ones excluded). */
  free: number;
  reserved: number;
  needed: number;
  delayed: number;
  matches: number;
  /** Time slots in a row on the venues (scheduled sports). */
  slots: number;
  /** Minutes per slot (match + changeover). */
  slot: number;
  endDate: string;
  endTime: string;
  endsAnotherDay: boolean;
  late: boolean;
};

/** Figures shown under the venues step, from the engine's plan. */
export function summarizePlan(form: TournamentForm, sport: SportConfig, plan: Plan): PlanSummary {
  const end = isoToParis(plan.end);
  const rules = rulesFromSport(sport, form.teamFormat, storedConfig(form, sport));
  return {
    free: Math.max(1, form.venueCount - form.reservedLabels.length),
    reserved: form.reservedLabels.length,
    needed: plan.firstRoundVenuesNeeded,
    delayed: plan.firstRoundDelayed,
    matches: plan.totalMatches,
    slots: plan.rounds.reduce((sum, r) => sum + r.waves, 0),
    slot: slotMinutes(rules),
    endDate: end.date,
    endTime: end.time,
    endsAnotherDay: end.date !== form.date,
    late: plan.end > parisToIso(form.date, LATE_END),
  };
}
