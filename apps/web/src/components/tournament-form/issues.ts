import type { SportConfig } from "@orgasport/sports";
import { fmt, getMessages } from "@/i18n";
import { FIELD_STEP, STEPS, type FormIssue, type Step, type TournamentForm } from "@/lib/tournament-form";

/**
 * Validation issues (from validateForm) turned into French sentences and
 * attached to a field of the form. Paths look like "name", "organizer.email"
 * or "coOrganizers.2": the field key drops array indexes.
 */
export function fieldKey(path: string): string {
  const [head, sub] = path.split(".");
  if (head === "organizer" && sub) return `organizer.${sub}`;
  return head ?? "";
}

/** Step that holds the field of an issue. */
export function stepOfIssue(issue: FormIssue): Step {
  const head = issue.path.split(".")[0] as keyof TournamentForm;
  return FIELD_STEP[head] ?? "summary";
}

/** Placeholders used by the messages: the sport's venue and team nouns. */
export function venueVars(sport: SportConfig): Record<string, string> {
  const { singular, plural } = sport.venue.noun;
  return { venue: singular, venues: plural, Venues: plural.charAt(0).toUpperCase() + plural.slice(1), teamNoun: sport.teamNoun.plural };
}

export function issueMessage(issue: FormIssue, vars: Record<string, string | number> = {}): string {
  const t = getMessages().wizard.issues;
  const key = fieldKey(issue.path);
  const template = t.byPath[`${key}.${issue.code}`] ?? t.byPath[key] ?? t.fallback;
  return fmt(template, vars);
}

/** First issue of each field, for inline errors. */
export function issuesByField(issues: FormIssue[]): Map<string, FormIssue> {
  const out = new Map<string, FormIssue>();
  for (const issue of issues) {
    const key = fieldKey(issue.path);
    if (!out.has(key)) out.set(key, issue);
  }
  return out;
}

/** Issues sorted in the order of the steps, one per field. */
export function orderedIssues(issues: FormIssue[]): FormIssue[] {
  return [...issuesByField(issues).values()].sort((a, b) => STEPS.indexOf(stepOfIssue(a)) - STEPS.indexOf(stepOfIssue(b)));
}
