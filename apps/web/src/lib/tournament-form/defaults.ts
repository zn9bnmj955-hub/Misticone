import type { SportConfig } from "@orgasport/sports";
import type { TournamentForm } from "./schema";
import { nextSaturday, shiftTime } from "./time";

export type FormContext = {
  club: {
    name: string;
    address?: string | null;
    postcode?: string | null;
    city?: string | null;
    lat?: number | null;
    lng?: number | null;
    default_venue_count?: number | null;
    contact_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
  };
  /** The signed-in organizer. */
  person: { name?: string | null; email?: string | null };
  nowMs: number;
};

/** Clamp the club's usual number of venues to what the sport plans for. */
function venueCountFor(sport: SportConfig, clubVenues: number | null | undefined): number {
  if (clubVenues && clubVenues > 0) return Math.min(500, clubVenues);
  return sport.defaults.venues;
}

/**
 * A complete, valid form from the sport defaults and what we already know
 * about the club: a hurried club can go straight to the summary.
 */
export function defaultForm(sport: SportConfig, ctx: FormContext): TournamentForm {
  const d = sport.defaults;
  const s = d.schedule;
  const teamFormat = sport.teamFormats.find((f) => f.id === d.teamFormat) ?? sport.teamFormats[0]!;
  const venueCount = venueCountFor(sport, ctx.club.default_venue_count);
  return {
    organizer: {
      name: (ctx.club.contact_name || ctx.person.name || ctx.club.name).slice(0, 80),
      phone: ctx.club.contact_phone ?? "",
      email: (ctx.person.email || ctx.club.contact_email || "").slice(0, 160),
    },
    coOrganizers: [],
    pinCount: 1,
    referee: "",
    sportSlug: sport.slug,
    name: "",
    date: nextSaturday(ctx.nowMs),
    startTime: s.startTime,
    registrationClosesTime: shiftTime(s.startTime, -s.registrationClosesBeforeMinutes),
    checkInClosesTime: shiftTime(s.startTime, -s.checkInClosesBeforeMinutes),
    address: ctx.club.address ?? "",
    postcode: ctx.club.postcode ?? "",
    city: ctx.club.city ?? "",
    lat: ctx.club.lat ?? null,
    lng: ctx.club.lng ?? null,
    parking: "",
    food: "",
    posterPath: null,
    rulesText: "",
    rulesPdfPath: null,
    teamFormat: teamFormat.id,
    substitutes: teamFormat.substitutes.min,
    category: d.category,
    eligibility: sport.license.requiredByDefault ? "licensed" : "open",
    maxTeams: d.maxTeams,
    waitlist: true,
    registrationMode: "both",
    nameDisplay: "initials",
    feeCents: d.feeCents,
    feePer: d.feePer,
    prizeText: "",
    format: d.competitionFormat,
    rounds: d.rounds,
    bracketMode: d.redrawEachRound ? "redraw" : "fixed",
    cadrageAfterRound: d.cadrageAfterRound,
    consolation: d.consolation,
    consolationEntry: d.consolationEntry,
    consolationFeeCents: 0,
    consolationC: d.consolationC,
    pause: "none",
    avoidSameClub: d.avoidSameClubFirstRound,
    seeding: false,
    poolSize: d.poolSize,
    poolQualifiers: 2,
    scoreEntry: "table",
    autoDraw: false,
    timeLimitMinutes: null,
    durationMinutes: sport.scoring.mode === "time" ? sport.scoring.durationMinutes : null,
    ranking: [...sport.ranking.criteria],
    venueCount,
    venueLabels: [],
    reservedLabels: [],
    notifications: true,
    welcomeMessage: "",
    reminderDayBefore: true,
  };
}

/** Rounds asked for formats that need a fixed number of games. */
export function defaultRounds(format: TournamentForm["format"], teams: number): number | null {
  if (format === "swiss") return Math.max(3, Math.min(6, Math.ceil(Math.log2(Math.max(2, teams)))));
  if (format === "melee_rotation") return 4;
  return null;
}

/**
 * The organizer picked another sport: keep what does not depend on the sport
 * (who, name, date, place, money text, communication) and reset the rest to
 * the new sport's defaults.
 */
export function switchSport(form: TournamentForm, sport: SportConfig, ctx: FormContext): TournamentForm {
  const fresh = defaultForm(sport, ctx);
  return {
    ...fresh,
    organizer: form.organizer,
    coOrganizers: form.coOrganizers,
    pinCount: form.pinCount,
    referee: form.referee,
    name: form.name,
    date: form.date,
    address: form.address,
    postcode: form.postcode,
    city: form.city,
    lat: form.lat,
    lng: form.lng,
    parking: form.parking,
    food: form.food,
    posterPath: form.posterPath,
    rulesText: form.rulesText,
    rulesPdfPath: form.rulesPdfPath,
    prizeText: form.prizeText,
    notifications: form.notifications,
    welcomeMessage: form.welcomeMessage,
    reminderDayBefore: form.reminderDayBefore,
  };
}

/**
 * A draft saved earlier may be incomplete or come from an older version of
 * the form: fill every missing key from the defaults so the screens always
 * get a complete object.
 */
export function mergeDraft(draft: unknown, sport: SportConfig, ctx: FormContext): TournamentForm {
  const base = defaultForm(sport, ctx);
  if (!draft || typeof draft !== "object") return base;
  const d = draft as Partial<TournamentForm>;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base) as (keyof TournamentForm)[]) {
    const value = d[key];
    if (value === undefined) continue;
    const ref = base[key];
    // Keep only values of the expected kind; anything odd falls back to the default.
    if (ref === null || typeof value === typeof ref || (Array.isArray(ref) && Array.isArray(value))) out[key] = value;
  }
  out.sportSlug = sport.slug;
  if (d.organizer && typeof d.organizer === "object") out.organizer = { ...base.organizer, ...d.organizer };
  return out as TournamentForm;
}
