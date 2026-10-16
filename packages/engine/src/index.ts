// OrgaSport draw engine — pure functions, no UI, no database.
export * from "./types";
export * from "./errors";
export { createRng, createIdGenerator, hash128, type Rng } from "./rng";
export { Transaction, applyChanges, invertChanges, compactChanges, canInvert, conflictsWithLater, type Change } from "./tx";
export { rulesFromSport, resolveConfig, defaultTournamentConfig, defaultForfeitScore, defaultConsolationSource, type StoredTournamentConfig } from "./config";
export { resolveScore } from "./scoring";
export {
  isFinished,
  hasResult,
  roundsOf,
  matchesOfRound,
  lastRound,
  isRoundComplete,
  teamMatches,
  eligibleTeams,
  teamsLeftOut,
  statusBeforeForfeit,
  winnerTeams,
  loserTeams,
  ACTIVE_ON_VENUE,
} from "./queries";
export { stageOf, isFinalPhaseMatch, isFixedTree, compareRounds, teamsInRound, type Stage } from "./bracket";
export { canDrawNext, poolLabels, poolTeams, poolMatches, poolRanking, isPoolComplete, qualifiers, totalRounds } from "./formats";
export { computeStats, rankTeams, eliminationRanking, type TeamStats, type RankedTeam } from "./standings";
export { autoAssignVenues, venueQueue, queuePosition, estimatePlan, slotMinutes, type Plan, type PlanInput, type PlanRound } from "./venues";
export { applyCommand, isTournamentComplete, teamScoreCode, type Command, type CommandType, type CommandResult, type PlayerInput } from "./commands";
export * from "./shortCode";
