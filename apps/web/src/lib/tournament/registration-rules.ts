import { isValidLicenseNumber, type SportConfig } from "@orgasport/sports";

/**
 * Rules of an online registration, derived from the tournament settings and
 * the sport configuration. Pure functions (unit tested), shared by the form
 * and the server.
 */

export type RegistrationMeta = {
  status: string;
  registration_mode: "online" | "onsite" | "both";
  registration_closes_at: string | null;
  max_teams: number | null;
  waitlist_enabled: boolean;
  team_format: string | null;
  eligibility: "open" | "licensed" | "mixed";
  category: string;
  config: unknown;
};

/**
 * open: registrations accepted; waitlist: full, new teams go on the waiting
 * list; full: full and no waiting list; closed: too late (or the tournament
 * has started); onsite_only: the organizer only takes registrations on site.
 */
export type RegistrationWindow = "open" | "waitlist" | "full" | "closed" | "onsite_only";

export function registrationWindow(meta: RegistrationMeta, activeTeams: number, nowMs: number): RegistrationWindow {
  if (meta.status !== "published") return "closed";
  if (meta.registration_closes_at && Date.parse(meta.registration_closes_at) <= nowMs) return "closed";
  if (meta.registration_mode === "onsite") return "onsite_only";
  if (meta.max_teams !== null && activeTeams >= meta.max_teams) return meta.waitlist_enabled ? "waitlist" : "full";
  return "open";
}

export type TeamShape = {
  /** Players required on the team sheet. */
  players: number;
  /** Extra players allowed (substitutes). */
  substitutes: number;
  /** Mêlée: each person registers alone, teams are drawn. */
  individual: boolean;
  license: "required" | "optional" | "hidden";
  licenseHint: string | null;
  /** Categories a player can pick (when the tournament is open to all), else null. */
  categories: string[] | null;
};

export function teamShape(meta: RegistrationMeta, sport: SportConfig): TeamShape {
  const format = sport.teamFormats.find((f) => f.id === meta.team_format) ?? sport.teamFormats.find((f) => f.id === sport.defaults.teamFormat)!;
  const configured = Number((meta.config as { substitutes?: unknown } | null)?.substitutes ?? 0);
  const substitutes = format.individualRegistration ? 0 : Math.max(format.substitutes.min, Math.min(format.substitutes.max, Number.isFinite(configured) ? configured : 0));
  return {
    players: format.individualRegistration ? 1 : format.players,
    substitutes,
    individual: Boolean(format.individualRegistration),
    license: meta.eligibility === "licensed" ? "required" : meta.eligibility === "mixed" ? "optional" : "hidden",
    licenseHint: sport.license.numberHint,
    categories: meta.category === "all" ? sport.categories.filter((c) => c !== "all") : null,
  };
}

export type RegistrationInput = {
  teamName?: string | null;
  club?: string | null;
  players: { firstName: string; lastName: string; license?: string | null; category?: string | null }[];
  captain: { name: string; phone?: string | null; email?: string | null };
  acceptedRules: boolean;
  /** The signed-in person is the first player listed. */
  selfIsFirstPlayer?: boolean;
};

export type RegistrationIssue = { path: string; code: "required" | "too_long" | "license" | "contact" | "email" | "phone" | "count" | "rules" | "category" };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^[+0-9 .()-]{6,20}$/;

export function validateRegistration(input: RegistrationInput, shape: TeamShape, sport: SportConfig): RegistrationIssue[] {
  const issues: RegistrationIssue[] = [];
  const add = (path: string, code: RegistrationIssue["code"]) => issues.push({ path, code });
  const n = input.players.length;
  if (n < shape.players || n > shape.players + shape.substitutes) add("players", "count");
  input.players.forEach((p, i) => {
    if (!p.firstName.trim()) add(`players.${i}.firstName`, "required");
    if (!p.lastName.trim()) add(`players.${i}.lastName`, "required");
    if (p.firstName.length > 80) add(`players.${i}.firstName`, "too_long");
    if (p.lastName.length > 80) add(`players.${i}.lastName`, "too_long");
    const lic = (p.license ?? "").trim();
    // Substitutes beyond the required players may leave the license empty only when optional.
    if (shape.license === "required" && !lic) add(`players.${i}.license`, "required");
    if (shape.license !== "hidden" && lic && !isValidLicenseNumber(sport, lic)) add(`players.${i}.license`, "license");
    if (p.category && shape.categories && !shape.categories.includes(p.category)) add(`players.${i}.category`, "category");
  });
  if ((input.teamName ?? "").length > 80) add("teamName", "too_long");
  if ((input.club ?? "").length > 80) add("club", "too_long");
  if (!input.captain.name.trim()) add("captain.name", "required");
  const email = (input.captain.email ?? "").trim();
  const phone = (input.captain.phone ?? "").trim();
  if (!email && !phone) add("captain", "contact");
  if (email && !EMAIL_RE.test(email)) add("captain.email", "email");
  if (phone && !PHONE_RE.test(phone)) add("captain.phone", "phone");
  if (!input.acceptedRules) add("acceptedRules", "rules");
  return issues;
}
