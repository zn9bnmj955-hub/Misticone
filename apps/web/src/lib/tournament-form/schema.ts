import { z } from "zod";
import { CATEGORIES, COMPETITION_FORMATS, RANKING_CRITERIA, type SportConfig } from "@orgasport/sports";
import { DATE_RE, TIME_RE, parisToIso } from "./time";

/**
 * The "Créer un concours" form. The same shape is autosaved as a draft
 * (tournaments.draft_form, possibly incomplete), validated on the server
 * before payment, frozen on the payment row, and turned into a published
 * tournament by buildPublication(). Sport-specific choices are always
 * checked against the sport configuration, never against a sport name.
 */

export const STEPS = ["team", "general", "participants", "money", "draw", "venues", "communication", "summary"] as const;
export type Step = (typeof STEPS)[number];

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => trimmed(max).default("");

export const formSchema = z.object({
  // 1. Who uses the link
  organizer: z.object({
    name: trimmed(80).min(2),
    phone: trimmed(20).regex(/^[+0-9 .()-]{6,20}$/).or(z.literal("")),
    email: z.email().max(160),
  }),
  coOrganizers: z.array(z.email().max(160)).max(10).default([]),
  pinCount: z.number().int().min(0).max(10).default(1),
  referee: optionalText(80),

  // 2. General information
  sportSlug: z.string().regex(/^[a-z0-9-]+$/),
  name: trimmed(140).min(3),
  date: z.string().regex(DATE_RE),
  startTime: z.string().regex(TIME_RE),
  registrationClosesTime: z.string().regex(TIME_RE),
  checkInClosesTime: z.string().regex(TIME_RE),
  address: trimmed(200).min(3),
  postcode: trimmed(10).default(""),
  city: trimmed(80).min(1),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  parking: optionalText(300),
  food: optionalText(300),
  posterPath: z.string().max(300).nullable().default(null),
  rulesText: optionalText(5000),
  rulesPdfPath: z.string().max(300).nullable().default(null),

  // 3. Participants
  teamFormat: z.string().regex(/^[a-z0-9_-]+$/),
  substitutes: z.number().int().min(0).max(20).default(0),
  category: z.enum(CATEGORIES),
  eligibility: z.enum(["open", "licensed", "mixed"]),
  maxTeams: z.number().int().min(2).max(1024),
  waitlist: z.boolean().default(true),
  registrationMode: z.enum(["online", "onsite", "both"]),
  nameDisplay: z.enum(["full", "initials"]),

  // 4. Money (entry fees are paid on site for now)
  feeCents: z.number().int().min(0).max(100_000),
  feePer: z.enum(["team", "player"]),
  prizeText: optionalText(200),

  // 5. Draw and games
  format: z.enum(COMPETITION_FORMATS),
  rounds: z.number().int().min(1).max(30).nullable().default(null),
  bracketMode: z.enum(["fixed", "redraw"]),
  consolation: z.boolean(),
  consolationFromRound: z.number().int().min(1).max(10).default(1),
  avoidSameClub: z.boolean(),
  seeding: z.boolean().default(false),
  poolSize: z.number().int().min(3).max(8).default(4),
  poolQualifiers: z.number().int().min(1).max(4).default(2),
  scoreEntry: z.enum(["table", "captains"]).default("table"),
  autoDraw: z.boolean().default(false),
  /** Score-based games: optional time limit. Timed games: match duration. */
  timeLimitMinutes: z.number().int().min(5).max(600).nullable().default(null),
  durationMinutes: z.number().int().min(1).max(600).nullable().default(null),
  ranking: z.array(z.enum(RANKING_CRITERIA)).min(1),

  // 6. Venues
  venueCount: z.number().int().min(1).max(500),
  /** Custom names, in order; empty = numbered 1..N. */
  venueLabels: z.array(trimmed(30).min(1)).max(500).default([]),
  /** Names of the venues kept for the finals. */
  reservedLabels: z.array(trimmed(30).min(1)).max(50).default([]),

  // 7. Communication
  notifications: z.boolean().default(true),
  welcomeMessage: optionalText(500),
  reminderDayBefore: z.boolean().default(true),
});

export type TournamentForm = z.infer<typeof formSchema>;
export type TournamentFormInput = z.input<typeof formSchema>;

/** Drafts are saved as they are typed: any JSON object up to a sane size. */
export const draftSchema = z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length < 60_000, "draft too large");
export type DraftForm = Partial<TournamentForm>;

export type FormIssue = { path: string; code: string };

/** Which step a field belongs to (to send the organizer back to the right screen). */
export const FIELD_STEP: Record<keyof TournamentForm, Step> = {
  organizer: "team",
  coOrganizers: "team",
  pinCount: "team",
  referee: "team",
  sportSlug: "general",
  name: "general",
  date: "general",
  startTime: "general",
  registrationClosesTime: "general",
  checkInClosesTime: "general",
  address: "general",
  postcode: "general",
  city: "general",
  lat: "general",
  lng: "general",
  parking: "general",
  food: "general",
  posterPath: "general",
  rulesText: "general",
  rulesPdfPath: "general",
  teamFormat: "participants",
  substitutes: "participants",
  category: "participants",
  eligibility: "participants",
  maxTeams: "participants",
  waitlist: "participants",
  registrationMode: "participants",
  nameDisplay: "participants",
  feeCents: "money",
  feePer: "money",
  prizeText: "money",
  format: "draw",
  rounds: "draw",
  bracketMode: "draw",
  consolation: "draw",
  consolationFromRound: "draw",
  avoidSameClub: "draw",
  seeding: "draw",
  poolSize: "draw",
  poolQualifiers: "draw",
  scoreEntry: "draw",
  autoDraw: "draw",
  timeLimitMinutes: "draw",
  durationMinutes: "draw",
  ranking: "draw",
  venueCount: "venues",
  venueLabels: "venues",
  reservedLabels: "venues",
  notifications: "communication",
  welcomeMessage: "communication",
  reminderDayBefore: "communication",
};

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/**
 * Checks that only the sport configuration can answer: allowed team formats,
 * competition formats, categories, coherent times and venues.
 * `today` is the Paris calendar date ("YYYY-MM-DD").
 */
export function sportIssues(form: TournamentForm, sport: SportConfig, today: string, nowMs?: number): FormIssue[] {
  const issues: FormIssue[] = [];
  const add = (path: string, code: string) => issues.push({ path, code });
  // Same day: the start (and the end of online registrations) must still be ahead.
  if (nowMs !== undefined && form.date === today) {
    if (Date.parse(parisToIso(form.date, form.startTime)) <= nowMs) add("startTime", "in_past");
    else if (form.registrationMode !== "onsite" && Date.parse(parisToIso(form.date, form.registrationClosesTime)) <= nowMs) add("registrationClosesTime", "in_past");
  }
  if (form.sportSlug !== sport.slug) add("sportSlug", "sport_mismatch");
  const teamFormat = sport.teamFormats.find((f) => f.id === form.teamFormat);
  if (!teamFormat) add("teamFormat", "unknown_team_format");
  else if (form.substitutes < teamFormat.substitutes.min || form.substitutes > teamFormat.substitutes.max) add("substitutes", "out_of_range");
  if (!sport.competitionFormats.includes(form.format)) add("format", "format_not_allowed");
  if (!sport.categories.includes(form.category)) add("category", "category_not_allowed");
  if (form.ranking.some((c) => !sport.ranking.criteria.includes(c))) add("ranking", "criterion_not_allowed");
  if (form.date < today) add("date", "in_past");
  if (minutes(form.registrationClosesTime) > minutes(form.startTime)) add("registrationClosesTime", "after_start");
  if (minutes(form.checkInClosesTime) > minutes(form.startTime)) add("checkInClosesTime", "after_start");
  if (form.venueLabels.length > 0 && form.venueLabels.length !== form.venueCount) add("venueLabels", "count_mismatch");
  if (new Set(venueLabelsOf(form)).size !== form.venueCount) add("venueLabels", "duplicate");
  const labels = new Set(venueLabelsOf(form));
  if (form.reservedLabels.some((l) => !labels.has(l))) add("reservedLabels", "unknown_venue");
  if (form.reservedLabels.length >= form.venueCount) add("reservedLabels", "all_reserved");
  if ((form.format === "swiss" || form.format === "melee_rotation") && form.rounds == null) add("rounds", "required");
  if (sport.scoring.mode !== "points" && form.timeLimitMinutes != null) add("timeLimitMinutes", "not_applicable");
  if (sport.scoring.mode !== "time" && form.durationMinutes != null) add("durationMinutes", "not_applicable");
  if (form.coOrganizers.some((e) => e.toLowerCase() === form.organizer.email.toLowerCase())) add("coOrganizers", "same_as_organizer");
  return issues;
}

export function venueLabelsOf(form: Pick<TournamentForm, "venueCount" | "venueLabels">): string[] {
  if (form.venueLabels.length > 0) return form.venueLabels.slice(0, form.venueCount);
  return Array.from({ length: form.venueCount }, (_, i) => String(i + 1));
}

/** Full validation: schema + sport rules. Returns the parsed form or the issues. */
export function validateForm(
  raw: unknown,
  sportOf: (slug: string) => SportConfig | undefined,
  today: string,
  /** Current instant: also checks times on the same day (server side). */
  nowMs?: number,
): { ok: true; form: TournamentForm; sport: SportConfig } | { ok: false; issues: FormIssue[] } {
  const parsed = formSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), code: i.code })) };
  }
  const sport = sportOf(parsed.data.sportSlug);
  if (!sport || !sport.enabled) return { ok: false, issues: [{ path: "sportSlug", code: "unknown_sport" }] };
  const issues = sportIssues(parsed.data, sport, today, nowMs);
  return issues.length ? { ok: false, issues } : { ok: true, form: parsed.data, sport };
}

/** First step that has a problem, to reopen the form at the right place. */
export function firstStepWithIssue(issues: FormIssue[]): Step | null {
  let best: number | null = null;
  for (const i of issues) {
    const key = i.path.split(".")[0] as keyof TournamentForm;
    const step = FIELD_STEP[key];
    if (!step) continue;
    const idx = STEPS.indexOf(step);
    if (best === null || idx < best) best = idx;
  }
  return best === null ? null : STEPS[best]!;
}
