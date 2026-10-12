import {
  eliminationRanking,
  isFinished,
  matchesOfRound,
  poolLabels,
  poolMatches,
  poolRanking,
  queuePosition,
  rankTeams,
  roundsOf,
  stageOf,
  teamMatches,
  type EngineState,
  type Match,
  type RankedTeam,
  type Round,
} from "@orgasport/engine";
import { venueLabel, type SportConfig } from "@orgasport/sports";
import { fmt, type Messages } from "@/i18n";
import { publicTeamLabel } from "@/lib/names";

/** Everything the public pages need, computed once per request. */

export interface TeamView {
  id: string;
  number: number;
  /** "David / Fournier", "D. / F." or the team name. */
  label: string;
  club: string | null;
  search: string;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function buildTeamViews(state: EngineState, nameDisplay: "full" | "initials"): Map<string, TeamView> {
  const players = new Map<string, { first_name: string; last_name: string; position: number }[]>();
  for (const p of Object.values(state.players)) {
    const list = players.get(p.teamId) ?? [];
    list.push({ first_name: p.firstName, last_name: p.lastName, position: p.position });
    players.set(p.teamId, list);
  }
  const out = new Map<string, TeamView>();
  for (const t of Object.values(state.teams)) {
    const ps = (players.get(t.id) ?? []).sort((a, b) => a.position - b.position);
    const label = publicTeamLabel(t, ps, nameDisplay);
    // Search always works on what is shown publicly (never on hidden full names).
    out.set(t.id, { id: t.id, number: t.number, label, club: t.club, search: fold(`${t.number} ${label} ${t.name ?? ""} ${t.club ?? ""}`) });
  }
  return out;
}

export function findTeams(teams: Map<string, TeamView>, query: string): TeamView[] {
  const q = query.trim();
  if (!q) return [];
  if (/^\d+$/.test(q)) return [...teams.values()].filter((t) => t.number === Number(q));
  const words = fold(q).split(/\s+/).filter(Boolean);
  return [...teams.values()].filter((t) => words.every((w) => t.search.includes(w))).sort((a, b) => a.number - b.number);
}

/** "l'équipe 27 (Dupont / Martin)", as written after "contre". */
export function sideText(teams: Map<string, TeamView>, side: string[], m: Messages): string {
  if (side.length === 0) return "—";
  if (side.length === 1) {
    const t = teams.get(side[0]!);
    return t ? `${fmt(m.terrain.teamLower, { number: t.number })} (${t.label})` : "—";
  }
  // Mêlée tournante: several individuals.
  return side.map((id) => teams.get(id)?.label ?? "?").join(" & ");
}

export function sideShort(teams: Map<string, TeamView>, side: string[]): { number: string; label: string } {
  if (side.length === 0) return { number: "", label: "—" };
  if (side.length === 1) {
    const t = teams.get(side[0]!);
    return { number: t ? String(t.number) : "?", label: t?.label ?? "" };
  }
  return { number: side.map((id) => teams.get(id)?.number ?? "?").join("+"), label: side.map((id) => teams.get(id)?.label ?? "?").join(" & ") };
}

export function roundLabel(state: EngineState, round: Round, m: Messages): string {
  const r = m.terrain.rounds;
  let label: string;
  if (round.phase === "pool") label = fmt(r.pool, { n: round.number });
  else if (round.phase === "swiss") label = fmt(r.swiss, { n: round.number });
  else if (round.phase === "league") label = fmt(r.league, { n: round.number });
  else if (round.phase === "melee") label = fmt(r.melee, { n: round.number });
  else {
    const stage = stageOf(state, round);
    label = stage === "round" ? fmt(r.round, { n: round.number }) : r[stage];
  }
  return round.bracket === "consolation" ? fmt(r.consolation, { label }) : label;
}

/** Rounds to show on the "Tirage" tab: the current one(s) of each bracket. */
export function currentRounds(state: EngineState, bracket: "main" | "consolation"): Round[] {
  const rounds = roundsOf(state, bracket).filter((r) => r.status !== "pending");
  if (rounds.length === 0) return [];
  const open = rounds.filter((r) => r.status !== "finished");
  if (open.length === 0) return [rounds[rounds.length - 1]!];
  // Pools: all open pool rounds are in play at once.
  return open;
}

export interface MyMatchInfo {
  match: Match;
  round: Round;
  side: "A" | "B";
  opponent: string[];
  queue: number | null;
}

export function teamTimeline(state: EngineState, teamId: string): MyMatchInfo[] {
  return teamMatches(state, teamId)
    .map((match) => {
      const round = state.rounds[match.roundId]!;
      const side: "A" | "B" = match.sideA.includes(teamId) ? "A" : "B";
      return { match, round, side, opponent: side === "A" ? match.sideB : match.sideA, queue: match.status === "waiting_venue" ? queuePosition(state, match.id) : null };
    })
    .sort((a, b) => (a.match.queuedAt ?? a.match.scheduledAt ?? "9").localeCompare(b.match.queuedAt ?? b.match.scheduledAt ?? "9") || (a.round.bracket === "main" ? -1 : 1));
}

/** The match a team should look at now: the one in play, or the next one. */
export function currentMatch(timeline: MyMatchInfo[]): MyMatchInfo | null {
  const order: Match["status"][] = ["ready", "playing", "score_submitted", "disputed", "waiting_venue", "pending"];
  for (const s of order) {
    const hit = timeline.find((t) => t.match.status === s);
    if (hit) return hit;
  }
  return null;
}

export function venueName(sport: SportConfig): string {
  return venueLabel(sport);
}

export interface StandingsBlock {
  title: string;
  rows: RankedTeam[];
}

/** Rankings shown on the "Classement" tab, depending on the format. */
export function standings(state: EngineState, m: Messages): StandingsBlock[] {
  const cfg = state.tournament.config;
  const all = Object.values(state.matches);
  if (cfg.format === "single_elimination") {
    const blocks: StandingsBlock[] = [];
    const main = roundsOf(state, "main", "elimination");
    if (main.length) blocks.push({ title: m.terrain.tabs.bracket, rows: eliminationRanking(state, main.map((r) => r.id)) });
    const cons = roundsOf(state, "consolation", "elimination");
    if (cons.length) blocks.push({ title: m.terrain.tabs.consolation, rows: eliminationRanking(state, cons.map((r) => r.id)) });
    return blocks;
  }
  if (cfg.format === "pools_then_bracket") {
    const blocks: StandingsBlock[] = [];
    const final = roundsOf(state, "main", "final");
    if (final.length) blocks.push({ title: m.terrain.tabs.bracket, rows: eliminationRanking(state, final.map((r) => r.id)) });
    for (const label of poolLabels(state)) {
      const order = poolRanking(state, label);
      const ranked = rankTeams(state, order, poolMatches(state, label), cfg.ranking, "pool");
      const byId = new Map(ranked.map((r) => [r.id, r]));
      blocks.push({ title: fmt(m.terrain.pool, { label }), rows: order.map((id, i) => ({ ...byId.get(id)!, rank: i + 1 })) });
    }
    return blocks;
  }
  const ids = [...new Set(all.flatMap((x) => [...x.sideA, ...x.sideB]))];
  return [{ title: m.terrain.tabs.standings, rows: rankTeams(state, ids, all.filter(isFinished), cfg.ranking, state.tournament.id) }];
}

export { matchesOfRound, roundsOf, poolLabels, poolMatches, poolRanking };
