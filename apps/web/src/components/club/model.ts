import type { Enums } from "@orgasport/db";

/**
 * Pure helpers of the club space (grouping, statistics, small rules).
 * No I/O here: everything is unit-tested in model.test.ts.
 */

export type TournamentStatus = Enums<"tournament_status">;
export type TeamStatus = Enums<"team_status">;
export type ClubRole = Enums<"club_role">;
export type ClubKind = Enums<"club_kind">;

export const CLUB_KINDS = [
  "federated_club",
  "association",
  "festival_committee",
  "town_hall",
  "company",
  "other",
] as const satisfies readonly ClubKind[];

/** Statuses of a tournament that is online and not over yet. */
export const CURRENT_STATUSES: readonly TournamentStatus[] = ["live", "check_in", "registration_closed", "published"];
export const PAST_STATUSES: readonly TournamentStatus[] = ["finished", "archived"];
export const STATUS_ORDER: readonly TournamentStatus[] = [
  "live",
  "check_in",
  "registration_closed",
  "published",
  "draft",
  "finished",
  "archived",
];

/** Teams that hold a place (the waiting list and withdrawals do not). */
export function isActiveTeam(status: TeamStatus): boolean {
  return status !== "waitlist" && status !== "withdrawn";
}

export function countTeams(teams: readonly { status: TeamStatus }[]): { active: number; waitlist: number } {
  let active = 0;
  let waitlist = 0;
  for (const t of teams) {
    if (t.status === "waitlist") waitlist++;
    else if (isActiveTeam(t.status)) active++;
  }
  return { active, waitlist };
}

type Groupable = { status: TournamentStatus; starts_at: string | null; updated_at?: string | null };

const time = (iso: string | null | undefined, fallback: number) => (iso ? new Date(iso).getTime() : fallback);

/**
 * Dashboard sections: current (live first, then the soonest), drafts (most
 * recently edited first), past (most recent first).
 */
export function groupClubTournaments<T extends Groupable>(rows: readonly T[]): { current: T[]; drafts: T[]; past: T[] } {
  const rank = (s: TournamentStatus) => CURRENT_STATUSES.indexOf(s);
  const current = rows
    .filter((r) => CURRENT_STATUSES.includes(r.status))
    .sort((a, b) => rank(a.status) - rank(b.status) || time(a.starts_at, Infinity) - time(b.starts_at, Infinity));
  const drafts = rows
    .filter((r) => r.status === "draft")
    .sort((a, b) => time(b.updated_at, 0) - time(a.updated_at, 0));
  const past = rows.filter((r) => PAST_STATUSES.includes(r.status)).sort((a, b) => time(b.starts_at, 0) - time(a.starts_at, 0));
  return { current, drafts, past };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export type StatsTournament = {
  status: TournamentStatus;
  sport_slug: string;
  starts_at: string | null;
  max_teams: number | null;
  fee_cents: number;
  fee_per: string;
  teams: { status: TeamStatus; players: number }[];
};

export type MonthStats = { key: string; tournaments: number; teams: number };

export type ClubStats = {
  /** Every tournament of the club, drafts included. */
  total: number;
  byStatus: { status: TournamentStatus; count: number }[];
  bySport: { slug: string; count: number }[];
  /** Below: published tournaments only (not drafts). */
  published: number;
  teams: number;
  waitlist: number;
  players: number;
  /** Mean of (teams / max teams) over tournaments with a maximum, 0..1; null when none. */
  fillRate: number | null;
  expectedFeesCents: number;
  /** The last 12 months (Paris time), oldest first, current month last. */
  months: MonthStats[];
};

const monthFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" });

/** "2026-10" in Paris time. */
export function monthKey(date: Date): string {
  const parts = monthFormat.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

/** The 12 month keys ending with the month of `now`. */
export function lastTwelveMonths(now: Date): string[] {
  const [y, m] = monthKey(now).split("-").map(Number) as [number, number];
  const keys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i;
    keys.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
  }
  return keys;
}

export function aggregateClubStats(rows: readonly StatsTournament[], now: Date): ClubStats {
  const statusCount = new Map<TournamentStatus, number>();
  const sportCount = new Map<string, number>();
  const months = new Map(lastTwelveMonths(now).map((key) => [key, { key, tournaments: 0, teams: 0 }]));
  let published = 0;
  let teams = 0;
  let waitlist = 0;
  let players = 0;
  let fees = 0;
  let fillSum = 0;
  let fillCount = 0;

  for (const t of rows) {
    statusCount.set(t.status, (statusCount.get(t.status) ?? 0) + 1);
    sportCount.set(t.sport_slug, (sportCount.get(t.sport_slug) ?? 0) + 1);
    if (t.status === "draft") continue;

    published++;
    const active = t.teams.filter((team) => isActiveTeam(team.status));
    const activePlayers = active.reduce((sum, team) => sum + team.players, 0);
    teams += active.length;
    players += activePlayers;
    waitlist += t.teams.filter((team) => team.status === "waitlist").length;
    fees += t.fee_cents * (t.fee_per === "player" ? activePlayers : active.length);
    if (t.max_teams && t.max_teams > 0) {
      fillSum += Math.min(1, active.length / t.max_teams);
      fillCount++;
    }
    const month = t.starts_at ? months.get(monthKey(new Date(t.starts_at))) : undefined;
    if (month) {
      month.tournaments++;
      month.teams += active.length;
    }
  }

  return {
    total: rows.length,
    byStatus: STATUS_ORDER.filter((s) => statusCount.has(s)).map((status) => ({ status, count: statusCount.get(status)! })),
    bySport: [...sportCount].map(([slug, count]) => ({ slug, count })).sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug)),
    published,
    teams,
    waitlist,
    players,
    fillRate: fillCount > 0 ? fillSum / fillCount : null,
    expectedFeesCents: fees,
    months: [...months.values()],
  };
}

// ---------------------------------------------------------------------------
// Small rules
// ---------------------------------------------------------------------------

export const isClubAdminRole = (role: ClubRole | null | undefined) => role === "owner" || role === "admin";

/**
 * Whether an admin may change or remove a member: never the owner, never
 * oneself (an admin who demotes or removes themselves would lock themselves out).
 */
export function canEditMember(actor: { id: string; role: ClubRole }, target: { userId: string; role: ClubRole }): boolean {
  return isClubAdminRole(actor.role) && target.role !== "owner" && target.userId !== actor.id;
}

/** "s•••••@club.fr": enough to recognise one's own address, not to harvest it. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${email[0]}${"•".repeat(Math.max(2, Math.min(6, at - 1)))}${email.slice(at)}`;
}

const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

/** "26 octobre 2026" (Paris time). */
export function formatLongDate(iso: string | Date): string {
  return longDate.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** Only absolute http(s) links are accepted (no javascript:, no relative paths). */
export function normalizeLink(raw: string | null | undefined): string | null | "invalid" {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "invalid";
  } catch {
    return "invalid";
  }
}
