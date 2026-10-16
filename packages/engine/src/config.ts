import { z } from "zod";
import type { SportConfig } from "@orgasport/sports";
import type { CompetitionFormat, ConsolationSource, ScoringRules, SportRules, TournamentConfig } from "./types";

/**
 * Turns a sport configuration (packages/sports) into the rules the engine
 * reads. This is the only bridge between sports and the engine: the engine
 * itself never looks at a sport slug.
 */
const scoringOverrideSchema = z
  .object({
    timeLimitMinutes: z.number().int().min(1).max(600).nullable(),
    durationMinutes: z.number().int().min(1).max(600),
  })
  .partial();

/**
 * Optional per-tournament overrides of the sport's game length, stored in
 * tournaments.config.scoring: a time limit for score-based games, a duration
 * for timed games. Anything invalid is ignored.
 */
function applyScoringOverride(scoring: ScoringRules, typical: number, stored: unknown): { scoring: ScoringRules; typical: number } {
  const raw = (stored as { scoring?: unknown } | null | undefined)?.scoring;
  const parsed = scoringOverrideSchema.safeParse(raw ?? {});
  if (!parsed.success) return { scoring, typical };
  const o = parsed.data;
  if (scoring.mode === "points" && o.timeLimitMinutes !== undefined) {
    const limit = o.timeLimitMinutes;
    return { scoring: { ...scoring, timeLimitMinutes: limit }, typical: limit ? Math.min(typical, limit) : typical };
  }
  if (scoring.mode === "time" && o.durationMinutes !== undefined) {
    return { scoring: { ...scoring, durationMinutes: o.durationMinutes }, typical: o.durationMinutes };
  }
  return { scoring, typical };
}

export function rulesFromSport(sport: SportConfig, teamFormatId?: string | null, storedConfig?: unknown): SportRules {
  const format = sport.teamFormats.find((f) => f.id === teamFormatId) ?? sport.teamFormats.find((f) => f.id === sport.defaults.teamFormat);
  const { scoring, typical } = applyScoringOverride(sport.scoring as ScoringRules, sport.typicalMatchMinutes, storedConfig);
  return {
    scoring,
    venueUsage: sport.venue.usage,
    typicalMatchMinutes: typical,
    changeoverMinutes: sport.changeoverMinutes,
    ranking: sport.ranking.criteria,
    matchPoints: sport.ranking.matchPoints,
    teamSize: format?.players ?? 1,
  };
}

export function defaultForfeitScore(scoring: ScoringRules): { winner: number; loser: number } {
  if (scoring.mode === "points") return { winner: scoring.target, loser: 0 };
  if (scoring.mode === "sets") return { winner: scoring.setsToWin, loser: 0 };
  return { winner: 3, loser: 0 };
}

/** The B takes the pool non-qualifiers after pools, the losers of the A's 1st game otherwise. */
export function defaultConsolationSource(format: CompetitionFormat): ConsolationSource {
  return format === "pools_then_bracket" ? "pool_non_qualified" : "losers_round_1";
}

export function defaultTournamentConfig(sport: SportConfig): TournamentConfig {
  const d = sport.defaults;
  const format = d.competitionFormat as CompetitionFormat;
  const forfeitScore = defaultForfeitScore(sport.scoring as ScoringRules);
  return {
    format,
    bracketMode: d.redrawEachRound ? "redraw" : "fixed",
    rounds: d.rounds,
    cadrage: { afterRound: d.cadrageAfterRound },
    consolation: {
      enabled: d.consolation,
      source: defaultConsolationSource(format),
      entry: d.consolationEntry,
      feeCents: null,
      losersOfRound: d.consolationFromRound ?? 1,
    },
    consolationC: { enabled: d.consolationC, entry: d.consolationEntry, feeCents: null },
    pause: null,
    draw: { avoidSameClubFirstRound: d.avoidSameClubFirstRound, seeding: false },
    pools: { size: d.poolSize, qualifiers: 2, system: d.poolSystem },
    autoNextRound: true,
    autoDrawAt: null,
    scoreEntry: "table",
    reservedVenuesFrom: "semifinal",
    forfeitScore,
    byeScore: d.byeScore ?? forfeitScore,
    ranking: sport.ranking.criteria,
  };
}

const ENTRY = z.enum(["auto", "opt_in"]);
const FEE = z.number().int().min(0).max(100_000).nullable();
const SCORE = z.object({ winner: z.number().int().min(0), loser: z.number().int().min(0) });
const RANKING = z.enum(["wins", "match_points", "point_diff", "points_for", "head_to_head", "random"]);

/** Partial config as stored in tournaments.config; every key is optional. */
const storedConfigSchema = z
  .object({
    format: z.enum(["single_elimination", "pools_then_bracket", "swiss", "round_robin", "melee_rotation"]),
    bracketMode: z.enum(["fixed", "redraw"]),
    rounds: z.number().int().min(1).max(30).nullable(),
    cadrage: z.object({ afterRound: z.union([z.literal(1), z.literal(2)]) }),
    consolation: z
      .object({
        enabled: z.boolean(),
        source: z.enum(["losers_round_1", "pool_non_qualified"]),
        entry: ENTRY,
        feeCents: FEE,
        /** Legacy (before the B/C options): losers of this A round. Still read. */
        losersOfRound: z.number().int().min(1).max(10),
      })
      .partial(),
    consolationC: z.object({ enabled: z.boolean(), entry: ENTRY, feeCents: FEE }).partial(),
    pause: z.union([
      z.null(),
      z.object({ before: z.object({ remaining: z.union([z.literal(32), z.literal(16), z.literal(8), z.literal(4)]) }) }),
      z.literal("afterPools"),
      z.object({ afterRound: z.number().int().min(1).max(30) }),
    ]),
    draw: z.object({ avoidSameClubFirstRound: z.boolean(), seeding: z.boolean() }).partial(),
    pools: z
      .object({ size: z.number().int().min(3).max(8), qualifiers: z.number().int().min(1).max(4), system: z.enum(["gsl", "round_robin"]) })
      .partial(),
    autoNextRound: z.boolean(),
    autoDrawAt: z.string().nullable(),
    scoreEntry: z.enum(["table", "captains"]),
    reservedVenuesFrom: z.enum(["final", "semifinal"]),
    forfeitScore: SCORE,
    byeScore: SCORE,
    ranking: z.array(RANKING).min(1),
  })
  .partial();

export type StoredTournamentConfig = z.input<typeof storedConfigSchema>;

/** Stored (partial, possibly invalid) config + sport defaults → full config. Invalid keys fall back to defaults. */
export function resolveConfig(stored: unknown, sport: SportConfig): TournamentConfig {
  const base = defaultTournamentConfig(sport);
  const parsed = storedConfigSchema.safeParse(stored ?? {});
  const s = parsed.success ? parsed.data : {};
  const format = s.format ?? base.format;
  // Configs stored before the B/C options only hold {enabled, losersOfRound}:
  // the source then follows the format, and the entry stays automatic.
  const consolation = {
    ...base.consolation,
    source: defaultConsolationSource(format),
    ...s.consolation,
  };
  return {
    ...base,
    format,
    ...(s.bracketMode && { bracketMode: s.bracketMode }),
    ...(s.rounds !== undefined && { rounds: s.rounds }),
    ...(s.cadrage && { cadrage: s.cadrage }),
    consolation,
    consolationC: { ...base.consolationC, ...s.consolationC },
    ...(s.pause !== undefined && { pause: s.pause }),
    draw: { ...base.draw, ...s.draw },
    pools: { ...base.pools, ...s.pools },
    ...(s.autoNextRound !== undefined && { autoNextRound: s.autoNextRound }),
    ...(s.autoDrawAt !== undefined && { autoDrawAt: s.autoDrawAt }),
    ...(s.scoreEntry && { scoreEntry: s.scoreEntry }),
    ...(s.reservedVenuesFrom && { reservedVenuesFrom: s.reservedVenuesFrom }),
    ...(s.forfeitScore && { forfeitScore: s.forfeitScore }),
    // Without its own bye score, a sport that has none (byeScore null) keeps
    // giving byes the forfeit score, as before.
    byeScore: s.byeScore ?? (sport.defaults.byeScore ? base.byeScore : (s.forfeitScore ?? base.forfeitScore)),
    ...(s.ranking && { ranking: s.ranking }),
  };
}
