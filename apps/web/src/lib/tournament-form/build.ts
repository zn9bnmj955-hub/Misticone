import { estimatePlan, rulesFromSport, type Plan, type StoredTournamentConfig } from "@orgasport/engine";
import type { SportConfig } from "@orgasport/sports";
import { venueLabelsOf, type TournamentForm } from "./schema";
import { parisToIso } from "./time";

/** What tournaments.config stores: engine settings + form-only settings. */
export type TournamentStoredConfig = StoredTournamentConfig & {
  scoring?: { timeLimitMinutes?: number | null; durationMinutes?: number };
  communication: { notifications: boolean; reminderDayBefore: boolean };
  substitutes: number;
  referee: string | null;
};

export function storedConfig(form: TournamentForm, sport: SportConfig): TournamentStoredConfig {
  const scoring =
    sport.scoring.mode === "points"
      ? { timeLimitMinutes: form.timeLimitMinutes }
      : sport.scoring.mode === "time" && form.durationMinutes != null
        ? { durationMinutes: form.durationMinutes }
        : undefined;
  return {
    format: form.format,
    bracketMode: form.bracketMode,
    rounds: form.rounds,
    consolation: { enabled: form.consolation, losersOfRound: form.consolationFromRound },
    draw: { avoidSameClubFirstRound: form.avoidSameClub, seeding: form.seeding },
    pools: { size: form.poolSize, qualifiers: form.poolQualifiers, system: sport.defaults.poolSystem },
    autoNextRound: true,
    autoDrawAt: form.autoDraw ? parisToIso(form.date, form.startTime) : null,
    scoreEntry: form.scoreEntry,
    reservedVenuesFrom: "semifinal",
    ranking: form.ranking,
    ...(scoring && { scoring }),
    communication: { notifications: form.notifications, reminderDayBefore: form.reminderDayBefore },
    substitutes: form.substitutes,
    referee: form.referee || null,
  };
}

/** Venues needed, delayed games and estimated end, from the engine's planner. */
export function planFor(form: TournamentForm, sport: SportConfig, teams = form.maxTeams): Plan {
  const config = storedConfig(form, sport);
  const free = Math.max(1, form.venueCount - form.reservedLabels.length);
  return estimatePlan({
    format: form.format,
    teams,
    venues: free,
    rules: rulesFromSport(sport, form.teamFormat, config),
    startAt: parisToIso(form.date, form.startTime),
    rounds: form.rounds,
    poolSize: form.poolSize,
    poolSystem: sport.defaults.poolSystem,
    poolQualifiers: form.poolQualifiers,
    consolation: form.consolation,
  });
}

export type PublicationStaff = {
  role: "organizer" | "co_organizer" | "referee";
  label: string;
  user_id?: string | null;
  email?: string | null;
  phone?: string | null;
  pin?: string | null;
};

export type Publication = {
  fields: Record<string, unknown>;
  venues: { label: string; position: number; reserved: boolean }[];
  staff: PublicationStaff[];
};

/**
 * Turns a validated form into the arguments of the SQL function
 * publish_tournament(). `pins` are the clear-text PIN codes generated for
 * the volunteers (hashed by the database, sent once to the organizer).
 */
export function buildPublication(
  form: TournamentForm,
  sport: SportConfig,
  opts: { organizerUserId: string | null; pins: string[]; pinLabel: (n: number) => string },
): Publication {
  const startsAt = parisToIso(form.date, form.startTime);
  const plan = planFor(form, sport);
  const reserved = new Set(form.reservedLabels);
  const fields = {
    name: form.name,
    sport_slug: sport.slug,
    starts_at: startsAt,
    registration_closes_at: parisToIso(form.date, form.registrationClosesTime),
    checkin_closes_at: parisToIso(form.date, form.checkInClosesTime),
    estimated_end_at: plan.end,
    address: form.address,
    postcode: form.postcode || null,
    city: form.city,
    lat: form.lat,
    lng: form.lng,
    parking: form.parking || null,
    food: form.food || null,
    poster_path: form.posterPath,
    rules_text: form.rulesText || null,
    rules_pdf_path: form.rulesPdfPath,
    team_format: form.teamFormat,
    category: form.category,
    eligibility: form.eligibility,
    max_teams: form.maxTeams,
    waitlist_enabled: form.waitlist,
    registration_mode: form.registrationMode,
    name_display: form.nameDisplay,
    fee_cents: form.feeCents,
    fee_per: form.feePer,
    prize_text: form.prizeText || null,
    welcome_message: form.welcomeMessage || null,
    contact_name: form.organizer.name,
    contact_phone: form.organizer.phone || null,
    config: storedConfig(form, sport),
  };
  const venues = venueLabelsOf(form).map((label, i) => ({ label, position: i + 1, reserved: reserved.has(label) }));
  const staff: PublicationStaff[] = [
    {
      role: "organizer",
      label: form.organizer.name,
      user_id: opts.organizerUserId,
      email: form.organizer.email,
      phone: form.organizer.phone || null,
    },
    ...form.coOrganizers.map((email) => ({ role: "co_organizer" as const, label: email, email })),
    ...opts.pins.map((pin, i) => ({ role: "co_organizer" as const, label: opts.pinLabel(i + 1), pin })),
  ];
  return { fields, venues, staff };
}
