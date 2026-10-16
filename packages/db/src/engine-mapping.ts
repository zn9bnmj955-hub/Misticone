import type { Bracket, Change, EngineState, EntityName, Match, PlayerClub, SportRules, TournamentConfig } from "@orgasport/engine";

/**
 * Two-way mapping between the draw engine state (camelCase entities) and the
 * database rows (snake_case tables). Shared by the server and the seed
 * generator so both write exactly the same shapes.
 */

export interface DbChange {
  table: "teams" | "players" | "venues" | "rounds" | "matches" | "team_secrets" | "registrations" | "tournaments";
  op: "insert" | "update" | "delete";
  key: "id" | "team_id";
  id: string;
  values?: Record<string, unknown>;
}

const TABLE: Record<EntityName, DbChange["table"]> = {
  team: "teams",
  player: "players",
  venue: "venues",
  round: "rounds",
  match: "matches",
  teamSecret: "team_secrets",
  registration: "registrations",
  tournament: "tournaments",
};

type Row = Record<string, unknown>;

function sideColumns(side: string[], letter: "a" | "b"): Row {
  return side.length === 1
    ? { [`team_${letter}_id`]: side[0], [`side_${letter}`]: null }
    : { [`team_${letter}_id`]: null, [`side_${letter}`]: side.length ? side : null };
}

function winnerTeam(m: Pick<Match, "winner" | "sideA" | "sideB">): string | null {
  const side = m.winner === "A" ? m.sideA : m.winner === "B" ? m.sideB : [];
  return side.length === 1 ? side[0]! : null;
}

const UNCHANGED = Symbol.for("unchanged");

/** Player club ↔ two nullable columns (kept as a pair). */
function playerClubColumns(club: unknown): Row {
  if (club === UNCHANGED) return { club_number: UNCHANGED, club_name: UNCHANGED };
  const c = club as PlayerClub | null | undefined;
  return { club_number: c?.number ?? null, club_name: c?.name ?? null };
}

/** Full DB row for an engine entity. */
export function entityToRow(entity: EntityName, e: Row, tournamentId: string): Row {
  switch (entity) {
    case "team":
      return {
        id: e.id,
        tournament_id: tournamentId,
        number: e.number,
        name: e.name,
        club_name: e.club,
        status: e.status,
        seed: e.seed,
        bracket: e.bracket,
        checked_in_at: e.checkedInAt,
        bracket_entries: e.entries ?? [],
      };
    case "player":
      return {
        id: e.id,
        team_id: e.teamId,
        first_name: e.firstName,
        last_name: e.lastName,
        position: e.position,
        ...playerClubColumns(e.club),
      };
    case "venue":
      return { id: e.id, tournament_id: tournamentId, label: e.label, position: e.position, reserved_for_finals: e.reservedForFinals, available: e.available };
    case "round":
      return { id: e.id, tournament_id: tournamentId, bracket: e.bracket, phase: e.phase, kind: e.kind ?? "partie", number: e.number, status: e.status, seed: e.seed, drawn_at: e.drawnAt };
    case "match": {
      const m = e as unknown as Match;
      return {
        id: m.id,
        tournament_id: tournamentId,
        round_id: m.roundId,
        position: m.position,
        pool: m.pool,
        ...sideColumns(m.sideA, "a"),
        ...sideColumns(m.sideB, "b"),
        venue_id: m.venueId,
        scheduled_at: m.scheduledAt,
        started_at: m.startedAt,
        ended_at: m.endedAt,
        queued_at: m.queuedAt,
        score_a: m.scoreA,
        score_b: m.scoreB,
        tiebreak_a: m.tiebreakA,
        tiebreak_b: m.tiebreakB,
        winner_side: m.winner,
        winner_team_id: winnerTeam(m),
        status: m.status,
      };
    }
    case "teamSecret":
      return { team_id: e.id, code: e.code };
    case "registration":
      return { id: e.id, tournament_id: tournamentId, team_id: e.teamId, source: e.source };
    case "tournament":
      return { status: e.status };
  }
}

const MATCH_FIELD: Record<string, string[]> = {
  roundId: ["round_id"],
  position: ["position"],
  pool: ["pool"],
  sideA: ["team_a_id", "side_a", "winner_team_id"],
  sideB: ["team_b_id", "side_b", "winner_team_id"],
  venueId: ["venue_id"],
  scheduledAt: ["scheduled_at"],
  startedAt: ["started_at"],
  endedAt: ["ended_at"],
  queuedAt: ["queued_at"],
  scoreA: ["score_a"],
  scoreB: ["score_b"],
  tiebreakA: ["tiebreak_a"],
  tiebreakB: ["tiebreak_b"],
  winner: ["winner_side", "winner_team_id"],
  status: ["status"],
};

/**
 * Engine changes → DB changes. Updates only carry the columns that changed;
 * derived columns (team ids, winner team) are recomputed from the final
 * entity, read from `state` (the state after the command).
 */
export function toDbChanges(changes: Change[], state: EngineState, tournamentId: string): DbChange[] {
  const out: DbChange[] = [];
  for (const c of changes) {
    const table = TABLE[c.entity];
    const key = c.entity === "teamSecret" ? "team_id" : "id";
    if (c.op === "delete") {
      out.push({ table, op: "delete", key, id: c.id });
      continue;
    }
    if (c.op === "create") {
      out.push({ table, op: "insert", key, id: c.id, values: entityToRow(c.entity, c.after, tournamentId) });
      continue;
    }
    if (c.entity === "tournament") {
      out.push({ table, op: "update", key, id: c.id, values: { status: c.after.status } });
      continue;
    }
    const collection = { team: state.teams, player: state.players, venue: state.venues, round: state.rounds, match: state.matches, teamSecret: state.teamSecrets, registration: state.registrations }[c.entity];
    const current = (collection as unknown as Record<string, Row>)[c.id];
    if (!current) continue;
    const full = entityToRow(c.entity, current, tournamentId);
    let columns: string[];
    if (c.entity === "match") {
      columns = [...new Set(Object.keys(c.after).flatMap((k) => MATCH_FIELD[k] ?? []))];
    } else {
      // Optional engine fields (entries, club, kind) may be absent from `current`: probe them too.
      const keys = new Set([...Object.keys(current), "entries", "club", "kind"]);
      const probe = entityToRow(c.entity, { ...Object.fromEntries([...keys].map((k) => [k, UNCHANGED])), ...c.after }, tournamentId);
      columns = Object.keys(probe).filter((k) => probe[k] !== UNCHANGED && k !== "tournament_id" && k !== "id" && k !== "team_id");
    }
    const values = Object.fromEntries(columns.map((k) => [k, full[k]]));
    if (Object.keys(values).length) out.push({ table, op: "update", key, id: c.id, values });
  }
  return out;
}

// ---------------------------------------------------------------------------
// DB rows → engine state
// ---------------------------------------------------------------------------

export interface TournamentRows {
  tournament: { id: string; status: string; starts_at: string | null; max_teams: number | null };
  teams: Row[];
  players: Row[];
  venues: Row[];
  rounds: Row[];
  matches: Row[];
  teamSecrets: Row[];
  registrations: Row[];
}

const side = (teamId: unknown, many: unknown): string[] =>
  Array.isArray(many) && many.length ? (many as string[]) : teamId ? [teamId as string] : [];

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

export function rowsToEngineState(rows: TournamentRows, rules: SportRules, config: TournamentConfig): EngineState {
  const by = <T>(list: Row[], f: (r: Row) => T & { id: string }) => Object.fromEntries(list.map((r) => [f(r).id, f(r)]));
  return {
    tournament: {
      id: rows.tournament.id,
      status: rows.tournament.status as EngineState["tournament"]["status"],
      startsAt: iso(rows.tournament.starts_at),
      maxTeams: rows.tournament.max_teams,
      config,
    },
    rules,
    teams: by(rows.teams, (r) => ({
      id: r.id as string,
      number: r.number as number,
      name: (r.name as string) ?? null,
      club: (r.club_name as string) ?? null,
      status: r.status as EngineState["teams"][string]["status"],
      seed: (r.seed as number) ?? null,
      bracket: r.bracket as Bracket,
      checkedInAt: iso(r.checked_in_at),
      ...(Array.isArray(r.bracket_entries) && r.bracket_entries.length ? { entries: r.bracket_entries as Bracket[] } : {}),
    })),
    players: by(rows.players, (r) => ({
      id: r.id as string,
      teamId: r.team_id as string,
      firstName: r.first_name as string,
      lastName: r.last_name as string,
      position: r.position as number,
      ...(r.club_number || r.club_name ? { club: { number: (r.club_number as string) ?? "", name: (r.club_name as string) ?? "" } } : {}),
    })),
    venues: by(rows.venues, (r) => ({
      id: r.id as string,
      label: r.label as string,
      position: r.position as number,
      reservedForFinals: Boolean(r.reserved_for_finals),
      available: Boolean(r.available),
    })),
    rounds: by(rows.rounds, (r) => ({
      id: r.id as string,
      bracket: r.bracket as Bracket,
      ...(r.kind === "cadrage" ? { kind: "cadrage" as const } : {}),
      phase: r.phase as EngineState["rounds"][string]["phase"],
      number: r.number as number,
      status: r.status as EngineState["rounds"][string]["status"],
      seed: (r.seed as string) ?? null,
      drawnAt: iso(r.drawn_at),
    })),
    matches: by(rows.matches, (r) => ({
      id: r.id as string,
      roundId: r.round_id as string,
      position: r.position as number,
      pool: (r.pool as string) ?? null,
      sideA: side(r.team_a_id, r.side_a),
      sideB: side(r.team_b_id, r.side_b),
      venueId: (r.venue_id as string) ?? null,
      scheduledAt: iso(r.scheduled_at),
      startedAt: iso(r.started_at),
      endedAt: iso(r.ended_at),
      queuedAt: iso(r.queued_at),
      scoreA: (r.score_a as number) ?? null,
      scoreB: (r.score_b as number) ?? null,
      tiebreakA: (r.tiebreak_a as number) ?? null,
      tiebreakB: (r.tiebreak_b as number) ?? null,
      winner: (r.winner_side as Match["winner"]) ?? null,
      status: r.status as Match["status"],
    })),
    teamSecrets: by(rows.teamSecrets, (r) => ({ id: r.team_id as string, code: r.code as string })),
    registrations: by(rows.registrations, (r) => ({
      id: r.id as string,
      teamId: r.team_id as string,
      source: r.source as "online" | "onsite" | "organizer",
    })),
  };
}
