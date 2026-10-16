import { competitionFormatsFor, type SportConfig } from "@orgasport/sports";
import { defaultRounds } from "./defaults";
import { planFor } from "./build";
import type { TournamentForm } from "./schema";

/**
 * "Aide-moi à choisir": a format proposal computed from the number of teams,
 * the venues and the start time. Pure and deterministic, so the AI assistant
 * (phase 6) can call it as a tool and the organizer always gets the same
 * figures. Only formats allowed by the sport configuration are proposed.
 * It never estimates an end time nor a duration: games last as long as they
 * last, so only counts (venues needed, matches) are given.
 */
export type FormatAdvice = {
  changes: Partial<
    Pick<TournamentForm, "format" | "rounds" | "bracketMode" | "consolation" | "consolationFromRound" | "poolSize">
  >;
  /** Message keys (i18n: wizard.advice.*) with their values, in order. */
  reasons: { key: string; values: Record<string, string | number> }[];
  plan: { firstRoundVenuesNeeded: number; firstRoundDelayed: number; totalMatches: number };
};

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

  const plan = planFor({ ...form, ...changes, maxTeams: teams } as TournamentForm, sport, teams);
  // Not enough venues to play the whole first round at once: say how many
  // would be needed (a count, never a time).
  if (sport.venue.usage === "parallel" && plan.firstRoundDelayed > 0) {
    reasons.push({ key: "moreVenues", values: { venues: plan.firstRoundVenuesNeeded + form.reservedLabels.length } });
  }

  return {
    changes,
    reasons,
    plan: {
      firstRoundVenuesNeeded: plan.firstRoundVenuesNeeded,
      firstRoundDelayed: plan.firstRoundDelayed,
      totalMatches: plan.totalMatches,
    },
  };
}
