import { z } from "zod";
import type { SportConfig } from "@orgasport/sports";
import type { CompetitionFormat, ScoringRules, SportRules, TournamentConfig } from "./types";

/**
 * Turns a sport configuration (packages/sports) into the rules the engine
 * reads. This is the only bridge between sports and the engine: the engine
 * itself never looks at a sport slug.
 */
export function rulesFromSport(sport: SportConfig, teamFormatId?: string | null): SportRules {
  const format = sport.teamFormats.find((f) => f.id === teamFormatId) ?? sport.teamFormats.find((f) => f.id === sport.defaults.teamFormat);
  return {
    scoring: sport.scoring as ScoringRules,
    venueUsage: sport.venue.usage,
    typicalMatchMinutes: sport.typicalMatchMinutes,
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

export function defaultTournamentConfig(sport: SportConfig): TournamentConfig {
  const d = sport.defaults;
  return {
    format: d.competitionFormat as CompetitionFormat,
    bracketMode: d.redrawEachRound ? "redraw" : "fixed",
    rounds: d.rounds,
    consolation: { enabled: d.consolation, losersOfRound: d.consolationFromRound ?? 1 },
    draw: { avoidSameClubFirstRound: d.avoidSameClubFirstRound, seeding: false },
    pools: { size: d.poolSize, qualifiers: 2, system: d.poolSystem },
    autoNextRound: true,
    autoDrawAt: null,
    scoreEntry: "table",
    reservedVenuesFrom: "semifinal",
    forfeitScore: defaultForfeitScore(sport.scoring as ScoringRules),
    ranking: sport.ranking.criteria,
  };
}

const RANKING = z.enum(["wins", "match_points", "point_diff", "points_for", "head_to_head", "random"]);

/** Partial config as stored in tournaments.config; every key is optional. */
const storedConfigSchema = z
  .object({
    format: z.enum(["single_elimination", "pools_then_bracket", "swiss", "round_robin", "melee_rotation"]),
    bracketMode: z.enum(["fixed", "redraw"]),
    rounds: z.number().int().min(1).max(30).nullable(),
    consolation: z.object({ enabled: z.boolean(), losersOfRound: z.number().int().min(1).max(10) }).partial(),
    draw: z.object({ avoidSameClubFirstRound: z.boolean(), seeding: z.boolean() }).partial(),
    pools: z
      .object({ size: z.number().int().min(3).max(8), qualifiers: z.number().int().min(1).max(4), system: z.enum(["gsl", "round_robin"]) })
      .partial(),
    autoNextRound: z.boolean(),
    autoDrawAt: z.string().nullable(),
    scoreEntry: z.enum(["table", "captains"]),
    reservedVenuesFrom: z.enum(["final", "semifinal"]),
    forfeitScore: z.object({ winner: z.number().int().min(0), loser: z.number().int().min(0) }),
    ranking: z.array(RANKING).min(1),
  })
  .partial();

export type StoredTournamentConfig = z.input<typeof storedConfigSchema>;

/** Stored (partial, possibly invalid) config + sport defaults → full config. Invalid keys fall back to defaults. */
export function resolveConfig(stored: unknown, sport: SportConfig): TournamentConfig {
  const base = defaultTournamentConfig(sport);
  const parsed = storedConfigSchema.safeParse(stored ?? {});
  const s = parsed.success ? parsed.data : {};
  return {
    ...base,
    ...(s.format && { format: s.format }),
    ...(s.bracketMode && { bracketMode: s.bracketMode }),
    ...(s.rounds !== undefined && { rounds: s.rounds }),
    consolation: { ...base.consolation, ...s.consolation },
    draw: { ...base.draw, ...s.draw },
    pools: { ...base.pools, ...s.pools },
    ...(s.autoNextRound !== undefined && { autoNextRound: s.autoNextRound }),
    ...(s.autoDrawAt !== undefined && { autoDrawAt: s.autoDrawAt }),
    ...(s.scoreEntry && { scoreEntry: s.scoreEntry }),
    ...(s.reservedVenuesFrom && { reservedVenuesFrom: s.reservedVenuesFrom }),
    ...(s.forfeitScore && { forfeitScore: s.forfeitScore }),
    ...(s.ranking && { ranking: s.ranking }),
  };
}
