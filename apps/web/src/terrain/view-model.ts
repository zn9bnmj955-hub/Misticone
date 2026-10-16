import {
  eliminationRanking,
  isFinished,
  isOfficeBye,
  loserTeams,
  matchesOfRound,
  poolLabels,
  poolMatches,
  poolRanking,
  queuePosition,
  rankTeams,
  roundLabel as engineRoundLabel,
  roundsOf,
  teamAffiliation,
  teamMatches,
  type Bracket,
  type EngineState,
  type Match,
  type RankedTeam,
  type Round,
} from "@orgasport/engine";
import { venueLabel, type SportConfig } from "@orgasport/sports";
import { fmt, getMessages, type Messages } from "@/i18n";
import { publicPlayerLine, publicTeamLabel } from "@/lib/names";

/** Everything the public pages need, computed once per request. */

export interface TeamView {
  id: string;
  number: number;
  /** "David / Fournier", "D. / F." or the team name. */
  label: string;
  club: string | null;
  /** Draw sheet: « NOM PRÉNOM » per player (or initials), else the team name. */
  players: string[];
  /** « (0340901/BOULE DU CAP AGDE) », « (N.H.) » or null. */
  affiliation: string | null;
  search: string;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function buildTeamViews(state: EngineState, nameDisplay: "full" | "initials", m: Messages = getMessages()): Map<string, TeamView> {
  const players = new Map<string, { first_name: string; last_name: string; position: number }[]>();
  for (const p of Object.values(state.players)) {
    const list = players.get(p.teamId) ?? [];
    list.push({ first_name: p.firstName, last_name: p.lastName, position: p.position });
    players.set(p.teamId, list);
  }
  const nh = m.terrain.sheet.nh;
  const out = new Map<string, TeamView>();
  for (const t of Object.values(state.teams)) {
    const ps = (players.get(t.id) ?? []).sort((a, b) => a.position - b.position);
    const label = publicTeamLabel(t, ps, nameDisplay);
    const lines = ps.map((p) => publicPlayerLine(p, nameDisplay)).filter(Boolean);
    // Search always works on what is shown publicly (never on hidden full names).
    out.set(t.id, {
      id: t.id,
      number: t.number,
      label,
      club: t.club,
      players: t.name ? [t.name.toLocaleUpperCase("fr-FR"), ...lines] : lines.length ? lines : [label],
      affiliation: affiliationText(state, t.id, t.club, nh),
      search: fold(`${t.number} ${label} ${t.name ?? ""} ${t.club ?? ""}`),
    });
  }
  return out;
}

/** « (n°/CLUB) » when every player is of the same club, « (N.H.) » when they differ, the club typed by hand, or nothing. */
function affiliationText(state: EngineState, teamId: string, typed: string | null, nh: string): string | null {
  const a = teamAffiliation(state, teamId);
  if (a.kind === "nh") return nh;
  if (a.kind === "club") return `(${[a.number, a.name.toLocaleUpperCase("fr-FR")].filter(Boolean).join("/")})`;
  return typed?.trim() ? `(${typed.trim().toLocaleUpperCase("fr-FR")})` : null;
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

/** « Cadrage », « 1re partie », « 1/4 de finale »…; « Concours B · … » outside the A. */
export function roundLabel(state: EngineState, round: Round, m: Messages): string {
  const r = m.terrain.rounds;
  const key = engineRoundLabel(state, round);
  const label = "n" in key ? (key.key === "partie" && key.n === 1 ? r.partie1 : fmt(r[key.key], { n: key.n })) : r[key.key];
  return round.bracket === "main" ? label : fmt(r.bracketRound, { bracket: m.terrain.sheet.brackets[round.bracket], label });
}

/** Rounds to show on the "Tirage" tab: the current one(s) of each bracket. */
export function currentRounds(state: EngineState, bracket: Bracket): Round[] {
  const rounds = roundsOf(state, bracket).filter((r) => r.status !== "pending");
  if (rounds.length === 0) return [];
  const open = rounds.filter((r) => r.status !== "finished");
  if (open.length === 0) return [rounds[rounds.length - 1]!];
  // Pools: all open pool rounds are in play at once.
  return open;
}

/** One side of a draw line. */
export interface DrawSide {
  teamIds: string[];
  /** « 27 », or « 3+7 » for individuals of a mêlée. */
  number: string;
  players: string[];
  affiliation: string | null;
  /** Lost this game: shown greyed. */
  lost: boolean;
}

/** One line of a draw table: Terrain | Équipe | Équipe | Score. */
export interface DrawRow {
  matchId: string;
  /** « T.8 », empty without a venue (and always for a team « d'office »). */
  venue: string;
  a: DrawSide | null;
  b: DrawSide | null;
  /** What faces a team alone: « Office » after the cadrage point, « Exempt » before. */
  alone: "office" | "exempt" | null;
  /** « 13 - 7 », « ** » while not played. */
  score: string;
  status: Match["status"];
}

export interface DrawRound {
  round: Round;
  label: string;
  rows: DrawRow[];
}

export interface DrawBracket {
  bracket: Bracket;
  /** « Concours A », « Concours B », « Concours C ». */
  title: string;
  /** Newest round first. */
  rounds: DrawRound[];
}

const BRACKETS: Bracket[] = ["main", "consolation", "consolation_c"];

function drawSide(teams: Map<string, TeamView>, ids: string[], lost: boolean): DrawSide | null {
  if (ids.length === 0) return null;
  const views = ids.map((id) => teams.get(id));
  if (ids.length === 1) {
    const t = views[0];
    return { teamIds: ids, number: t ? String(t.number) : "?", players: t?.players ?? [], affiliation: t?.affiliation ?? null, lost };
  }
  // Mêlée tournante: several individuals on one side.
  return {
    teamIds: ids,
    number: views.map((t) => t?.number ?? "?").join("+"),
    players: views.flatMap((t) => t?.players ?? []),
    affiliation: null,
    lost,
  };
}

function drawScore(state: EngineState, x: Match, m: Messages): string {
  const s = m.terrain.sheet;
  if (x.status === "bye") {
    if (isOfficeBye(state, x)) return s.notPlayed;
    const bye = state.tournament.config.byeScore;
    return x.scoreA !== null && x.scoreB !== null ? `${x.scoreA} - ${x.scoreB}` : `${bye.winner} - ${bye.loser}`;
  }
  if (x.status !== "done" && x.status !== "forfeit") return s.notPlayed;
  if (x.scoreA === null || x.scoreB === null) return x.status === "forfeit" ? m.terrain.status.forfeit : s.notPlayed;
  return `${x.scoreA} - ${x.scoreB}`;
}

/**
 * Draw sheets like the federation results pages: for each bracket (A, B, C)
 * one section per drawn round, newest first; each line gives the venue, both
 * teams (players, club or « N.H. »), who lost, and the score or « ** ».
 */
export function drawSheets(state: EngineState, teams: Map<string, TeamView>, sport: SportConfig, m: Messages): DrawBracket[] {
  const initial = venueLabel(sport).charAt(0);
  const venueText = (id: string | null) => {
    const v = id ? state.venues[id] : undefined;
    return v ? fmt(m.terrain.sheet.venue, { initial, label: v.label }) : "";
  };
  const out: DrawBracket[] = [];
  for (const bracket of BRACKETS) {
    const rounds = roundsOf(state, bracket).filter((r) => r.status !== "pending");
    if (rounds.length === 0) continue;
    out.push({
      bracket,
      title: m.terrain.sheet.brackets[bracket],
      rounds: [...rounds].reverse().map((round) => ({
        round,
        label: roundLabel(state, round, m),
        rows: matchesOfRound(state, round.id).map((x): DrawRow => {
          const losers = new Set(loserTeams(x));
          const a = drawSide(teams, x.sideA, x.sideA.length > 0 && x.sideA.every((id) => losers.has(id)));
          const b = drawSide(teams, x.sideB, x.sideB.length > 0 && x.sideB.every((id) => losers.has(id)));
          const office = x.status === "bye" && isOfficeBye(state, x);
          return {
            matchId: x.id,
            venue: office ? "" : venueText(x.venueId),
            // The team alone always comes first.
            a: a ?? b,
            b: a ? b : null,
            alone: x.status === "bye" ? (office ? "office" : "exempt") : null,
            score: drawScore(state, x, m),
            status: x.status,
          };
        }),
      })),
    });
  }
  return out;
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
