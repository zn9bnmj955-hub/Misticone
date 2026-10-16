import "server-only";
import { resolveConfig, rulesFromSport, type EngineState } from "@orgasport/engine";
import { getSport, type SportConfig } from "@orgasport/sports";
import { rowsToEngineState, type Tables } from "@orgasport/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/paginate";

export type TournamentMeta = Pick<
  Tables<"tournaments">,
  | "id"
  | "short_code"
  | "name"
  | "status"
  | "sport_slug"
  | "starts_at"
  | "registration_closes_at"
  | "checkin_closes_at"
  | "address"
  | "postcode"
  | "city"
  | "lat"
  | "lng"
  | "parking"
  | "food"
  | "team_format"
  | "category"
  | "eligibility"
  | "max_teams"
  | "name_display"
  | "fee_cents"
  | "fee_per"
  | "prize_text"
  | "welcome_message"
  | "rules_text"
  | "contact_name"
  | "contact_phone"
  | "state_version"
  | "config"
  | "club_id"
  | "registration_mode"
  | "waitlist_enabled"
  | "rules_pdf_path"
  | "poster_path"
> & { club: { name: string; slug: string } | null; /** Set once the personal data has been purged (14 days after the final). */ purged_at?: string | null };

export interface LoadedTournament {
  meta: TournamentMeta;
  sport: SportConfig;
  state: EngineState;
  version: number;
}

const META_COLUMNS =
  "id, short_code, name, status, sport_slug, starts_at, registration_closes_at, checkin_closes_at, address, postcode, city, lat, lng, parking, food, team_format, category, eligibility, max_teams, name_display, fee_cents, fee_per, prize_text, welcome_message, rules_text, contact_name, contact_phone, state_version, config, club_id, registration_mode, waitlist_enabled, rules_pdf_path, poster_path, purged_at, clubs (name, slug)";

/**
 * Loads a published tournament and builds the engine state. Uses the service
 * client: callers decide what the person may see (public view masks names,
 * the scoring table requires staff access).
 */
export async function loadTournament(code: string, opts: { secrets?: boolean } = {}): Promise<LoadedTournament | null> {
  const admin = createAdminClient();
  const { data: row, error } = await admin.from("tournaments").select(META_COLUMNS).eq("short_code", code).neq("status", "draft").maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const sport = getSport(row.sport_slug);
  if (!sport) return null;
  const tid = row.id;

  // Every list is paginated (max_rows = 1000) in a stable order and every error
  // is thrown: the engine must never compute on an incomplete state.
  const [teams, venues, rounds, matches, secrets, registrations, players] = await Promise.all([
    fetchAllRows((from, to) =>
      admin.from("teams").select("id, number, name, club_name, status, seed, bracket, checked_in_at, bracket_entries").eq("tournament_id", tid).order("id").range(from, to),
    ),
    fetchAllRows((from, to) =>
      admin.from("venues").select("id, label, position, reserved_for_finals, available").eq("tournament_id", tid).order("id").range(from, to),
    ),
    fetchAllRows((from, to) =>
      admin.from("rounds").select("id, bracket, phase, kind, number, status, seed, drawn_at").eq("tournament_id", tid).order("id").range(from, to),
    ),
    fetchAllRows((from, to) =>
      admin
        .from("matches")
        .select(
          "id, round_id, position, pool, team_a_id, team_b_id, side_a, side_b, venue_id, scheduled_at, started_at, ended_at, queued_at, score_a, score_b, tiebreak_a, tiebreak_b, winner_side, status",
        )
        .eq("tournament_id", tid)
        .order("id")
        .range(from, to),
    ),
    opts.secrets
      ? fetchAllRows((from, to) =>
          admin.from("team_secrets").select("team_id, code, teams!inner(tournament_id)").eq("teams.tournament_id", tid).order("team_id").range(from, to),
        )
      : Promise.resolve([]),
    fetchAllRows((from, to) => admin.from("registrations").select("id, team_id, source").eq("tournament_id", tid).order("id").range(from, to)),
    // Joined on the tournament (not `.in(team ids)`: beyond ~200 teams the URL is too long → 414).
    fetchAllRows((from, to) =>
      admin
        .from("players")
        .select("id, team_id, first_name, last_name, position, club_number, club_name, teams!inner(tournament_id)")
        .eq("teams.tournament_id", tid)
        .order("id")
        .range(from, to),
    ),
  ]);

  const { clubs, ...rest } = row as typeof row & { clubs: { name: string; slug: string } | null };
  const meta: TournamentMeta = { ...rest, club: clubs };
  const state = rowsToEngineState(
    {
      tournament: { id: tid, status: row.status, starts_at: row.starts_at, max_teams: row.max_teams },
      teams,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop the joined team row
      players: players.map(({ teams: _team, ...p }) => p),
      venues,
      rounds,
      matches,
      teamSecrets: secrets as Record<string, unknown>[],
      registrations,
    },
    rulesFromSport(sport, row.team_format, row.config),
    resolveConfig(row.config, sport),
  );
  return { meta, sport, state, version: row.state_version };
}
