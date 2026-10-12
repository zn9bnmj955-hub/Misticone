import type { SportConfig } from "@orgasport/sports";
import type { FormContext, Step, TournamentForm } from "@/lib/tournament-form";

/** What every step screen receives from the wizard. */
export type StepProps = {
  tournamentId: string;
  form: TournamentForm;
  sport: SportConfig;
  ctx: FormContext;
  /** Today in Paris ("YYYY-MM-DD"), computed by the server. */
  today: string;
  update: (patch: Partial<TournamentForm>) => void;
  /** Replace the whole form (sport switch, advice). */
  replace: (form: TournamentForm) => void;
  /** Inline error of a field ("name", "organizer.email"…), once the step has been checked. */
  error: (field: string) => string | undefined;
  /** {venue}, {venues}, {Venues}, {teamNoun}: the sport's nouns for messages. */
  vars: Record<string, string>;
  goTo: (step: Step) => void;
};

/** Stable DOM id of a field. */
export const fid = (field: string) => `tf-${field.replace(/\./g, "-")}`;
