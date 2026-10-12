import { formatTemplate, venueLabel, type SportConfig } from "@orgasport/sports";

/**
 * Notification texts come from the sport configuration (packages/sports:
 * `notifications`), so football says "Match dans 10 min, terrain 2" and
 * pétanque "À vous ! Terrain 12 · 15 h 40 · contre l'équipe 27 (…)".
 */
export type NotificationKind = "your_turn" | "draw_published" | "score_validated" | "tournament_starting" | "reminder_day_before" | "not_checked_in";

const TEMPLATE_KEY: Record<NotificationKind, keyof SportConfig["notifications"]> = {
  your_turn: "yourTurn",
  draw_published: "drawPublished",
  score_validated: "scoreValidated",
  tournament_starting: "tournamentStarting",
  reminder_day_before: "reminderDayBefore",
  not_checked_in: "notCheckedIn",
};

export type TemplateVars = {
  venue?: string;
  time?: string;
  opponent?: string;
  minutes?: number;
  round?: number | string;
  score?: string;
  tournament?: string;
  place?: string;
};

export function renderBody(sport: SportConfig, kind: NotificationKind, vars: TemplateVars): string {
  const template = sport.notifications[TEMPLATE_KEY[kind]];
  const values: Record<string, string | number> = { venueLabel: venueLabel(sport) };
  for (const [k, v] of Object.entries(vars)) if (v !== undefined && v !== null) values[k] = v;
  // Unknown placeholders would show as "{x}": drop them and tidy separators.
  return formatTemplate(template, values)
    .replace(/\{\w+\}/g, "")
    .replace(/\s*·\s*(·\s*)+/g, " · ")
    .replace(/\s*·\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
