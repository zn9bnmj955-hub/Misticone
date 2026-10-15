import { competitionFormatsFor, type SportConfig } from "@orgasport/sports";
import { defaultRounds } from "./defaults";
import { planFor } from "./build";
import type { TournamentForm } from "./schema";
import { isoToParis, parisToIso } from "./time";

/**
 * "Aide-moi à choisir": a format proposal computed from the number of teams,
 * the venues and the start time. Pure and deterministic, so the AI assistant
 * (phase 6) can call it as a tool and the organizer always gets the same
 * figures. Only formats allowed by the sport configuration are proposed.
 */
export type FormatAdvice = {
  changes: Partial<
    Pick<TournamentForm, "format" | "rounds" | "bracketMode" | "consolation" | "consolationFromRound" | "poolSize" | "venueCount">
  >;
  /** Message keys (i18n: wizard.advice.*) with their values, in order. */
  reasons: { key: string; values: Record<string, string | number> }[];
  plan: { end: string; endTime: string; firstRoundVenuesNeeded: number; firstRoundDelayed: number; totalMatches: number };
};

/** Past this local time, a one-day competition is considered too late. */
const LATE_END = "21:00";

export function suggestFormat(form: TournamentForm, sport: SportConfig, expectedTeams = form.maxTeams): FormatAdvice {
  const allowed = new Set(competitionFormatsFor(sport, form.teamFormat));
  const teams = Math.max(2, expectedTeams);
  const reasons: FormatAdvice["reasons"] = [];
  const pick = (...candidates: TournamentForm["format"][]) => candidates.find((f) => allowed.has(f)) ?? (allowed.has(sport.defaults.competitionFormat) ? sport.defaults.competitionFormat : [...allowed][0]!);

  let format: TournamentForm["format"];
  if (teams <= 6) {
    format = pick("round_robin", "pools_then_bracket", "single_elimination");
    reasons.push({ key: "fewTeams", values: { teams } });
  } else if (sport.venue.usage === "scheduled") {
    // Few venues reused in time slots: pools guarantee several games per team.
    format = pick("pools_then_bracket", "round_robin", "single_elimination");
    reasons.push({ key: "scheduledVenues", values: { teams } });
  } else {
    format = pick(sport.defaults.competitionFormat, "single_elimination");
    reasons.push({ key: "parallelVenues", values: { teams } });
  }

  const changes: FormatAdvice["changes"] = { format, rounds: defaultRounds(format, teams) };
  if (format === "single_elimination") {
    changes.bracketMode = sport.defaults.redrawEachRound ? "redraw" : "fixed";
    changes.consolation = teams >= 8 && sport.defaults.consolation;
    changes.consolationFromRound = 1;
    if (changes.consolation) reasons.push({ key: "consolation", values: {} });
  }
  if (format === "pools_then_bracket") changes.poolSize = teams % 4 === 0 || teams > 12 ? 4 : 3;

  let candidate = { ...form, ...changes, maxTeams: teams } as TournamentForm;
  let plan = planFor(candidate, sport, teams);

  // A parallel sport that would finish late: ask for more venues if the first
  // round cannot be played at once, otherwise shorten the competition.
  if (plan.end > parisToIso(form.date, LATE_END)) {
    if (sport.venue.usage === "parallel" && plan.firstRoundDelayed > 0) {
      changes.venueCount = plan.firstRoundVenuesNeeded + form.reservedLabels.length;
      reasons.push({ key: "moreVenues", values: { venues: changes.venueCount } });
    } else if (format === "single_elimination" && changes.consolation) {
      changes.consolation = false;
      reasons.push({ key: "noConsolation", values: {} });
    } else if (allowed.has("swiss") && format !== "swiss") {
      changes.format = "swiss";
      changes.rounds = 4;
      reasons.push({ key: "swissShorter", values: { rounds: 4 } });
    }
    candidate = { ...form, ...changes, maxTeams: teams } as TournamentForm;
    plan = planFor(candidate, sport, teams);
  }

  return {
    changes,
    reasons,
    plan: {
      end: plan.end,
      endTime: isoToParis(plan.end).time,
      firstRoundVenuesNeeded: plan.firstRoundVenuesNeeded,
      firstRoundDelayed: plan.firstRoundDelayed,
      totalMatches: plan.totalMatches,
    },
  };
}
