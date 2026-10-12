/**
 * Draw engine domain types. The engine is pure: it never reads a clock, a
 * random source or a database by itself. Everything comes in through the
 * state, the command and the context (now, seed, id generator).
 */

export type TournamentStatus =
  | "draft"
  | "published"
  | "registration_closed"
  | "check_in"
  | "live"
  | "finished"
  | "archived";

export type TeamStatus = "registered" | "waitlist" | "checked_in" | "forfeit" | "withdrawn";
export type Bracket = "main" | "consolation";
export type RoundStatus = "pending" | "drawn" | "live" | "finished";
export type Phase = "elimination" | "pool" | "final" | "swiss" | "league" | "melee";

export type MatchStatus =
  | "pending" // teams not known yet (fixed bracket placeholder)
  | "waiting_venue" // both sides known, waiting for a free venue
  | "ready" // venue (and time) assigned: "À vous de jouer"
  | "playing"
  | "score_submitted" // a captain entered a score, waiting for the opponent
  | "disputed" // captains disagree: the scoring table decides
  | "done"
  | "forfeit"
  | "bye";

export type Side = "A" | "B";
export type Winner = Side | "draw" | null;

export interface Team {
  id: string;
  number: number;
  name: string | null;
  club: string | null;
  status: TeamStatus;
  seed: number | null;
  bracket: Bracket;
  checkedInAt: string | null;
}

export interface Player {
  id: string;
  teamId: string;
  firstName: string;
  lastName: string;
  position: number;
}

export interface Venue {
  id: string;
  label: string;
  position: number;
  reservedForFinals: boolean;
  available: boolean;
}

export interface Round {
  id: string;
  bracket: Bracket;
  phase: Phase;
  number: number;
  status: RoundStatus;
  seed: string | null;
  drawnAt: string | null;
}

export interface Match {
  id: string;
  roundId: string;
  position: number;
  /** Pool label ("A", "B"…) for pool matches. */
  pool: string | null;
  /** Team ids on each side. One id per side, several in "mêlée tournante". */
  sideA: string[];
  sideB: string[];
  venueId: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /** When the match became playable: venue queue is first come, first served. */
  queuedAt: string | null;
  scoreA: number | null;
  scoreB: number | null;
  /** Shoot-out / tie-break result when a knockout match ends level. */
  tiebreakA: number | null;
  tiebreakB: number | null;
  winner: Winner;
  status: MatchStatus;
}

export interface TeamSecret {
  id: string; // = team id
  code: string;
}

export interface Registration {
  id: string;
  teamId: string;
  source: "online" | "onsite" | "organizer";
}

// ---------------------------------------------------------------------------
// Rules coming from the sport configuration (packages/sports)
// ---------------------------------------------------------------------------

export type ScoringRules =
  | { mode: "points"; target: number; timeLimitMinutes: number | null; allowDraw: false }
  | {
      mode: "time";
      durationMinutes: number;
      periods: number;
      allowDraw: boolean;
      knockoutTieBreak: "penalties" | "extra_time_then_penalties" | "golden_goal";
    }
  | { mode: "sets"; setsToWin: number; pointsPerSet: number; allowDraw: false };

export type RankingCriterion = "wins" | "match_points" | "point_diff" | "points_for" | "head_to_head" | "random";

export interface SportRules {
  scoring: ScoringRules;
  venueUsage: "parallel" | "scheduled";
  typicalMatchMinutes: number;
  changeoverMinutes: number;
  ranking: RankingCriterion[];
  matchPoints: { win: number; draw: number; loss: number };
  /** Players per team for the chosen team format (mêlée tournante side size). */
  teamSize: number;
}

// ---------------------------------------------------------------------------
// Tournament configuration (from the creation form)
// ---------------------------------------------------------------------------

export type CompetitionFormat = "single_elimination" | "pools_then_bracket" | "swiss" | "round_robin" | "melee_rotation";

export interface TournamentConfig {
  format: CompetitionFormat;
  /** Elimination: fixed tree drawn once, or a new draw at each round. */
  bracketMode: "fixed" | "redraw";
  /** Number of rounds for swiss and mêlée tournante. */
  rounds: number | null;
  consolation: { enabled: boolean; losersOfRound: number };
  draw: { avoidSameClubFirstRound: boolean; seeding: boolean };
  pools: { size: number; qualifiers: number; system: "gsl" | "round_robin" };
  /** Draw the next round automatically when the previous one is complete. */
  autoNextRound: boolean;
  /** Automatic first draw at this time (ISO), null = manual. */
  autoDrawAt: string | null;
  scoreEntry: "table" | "captains";
  /** Which matches may use venues reserved for finals. */
  reservedVenuesFrom: "final" | "semifinal";
  /** Score given to the winner / loser of a forfeit or a bye. */
  forfeitScore: { winner: number; loser: number };
  ranking: RankingCriterion[];
}

export interface EngineState {
  tournament: { id: string; status: TournamentStatus; startsAt: string | null; maxTeams: number | null; config: TournamentConfig };
  rules: SportRules;
  teams: Record<string, Team>;
  players: Record<string, Player>;
  venues: Record<string, Venue>;
  rounds: Record<string, Round>;
  matches: Record<string, Match>;
  teamSecrets: Record<string, TeamSecret>;
  registrations: Record<string, Registration>;
}

export type EntityName = "team" | "player" | "venue" | "round" | "match" | "teamSecret" | "registration" | "tournament";

export interface EngineContext {
  /** ISO timestamp of the action. */
  now: string;
  /** Unique id generator (deterministic from the client operation id). */
  newId: () => string;
}
