import "server-only";
import { resolveConfig, rulesFromSport, type EngineState } from "@orgasport/engine";
import { getSport, type SportConfig } from "@orgasport/sports";
import { rowsToEngineState, type Tables } from "@orgasport/db";
import { createAdminClient } from "@/lib/supabase/admin";

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
> & { club: { name: string; slug: string } | null };

export interface LoadedTournament {
  meta: TournamentMeta;
  sport: SportConfig;
  state: EngineState;
  version: number;
}

const META_COLUMNS =
  "id, short_code, name, status, sport_slug, starts_at, registration_closes_at, checkin_closes_at, address, postcode, city, lat, lng, parking, food, team_format, category, eligibility, max_teams, name_display, fee_cents, fee_per, prize_text, welcome_message, rules_text, contact_name, contact_phone, state_version, config, club_id, clubs (name, slug)";

/**
 * Loads a published tournament and builds the engine state. Uses the service
 * client: callers decide what the person may see (public view masks names,
 * the scoring table requires staff access).
 */
export async function loadTournament(code: string, opts: { secrets?: boolean } = {}): Promise<LoadedTournament | null> {
  const admin = createAdminClient();
  const { data: row } = await admin.from("tournaments").select(META_COLUMNS).eq("short_code", code).neq("status", "draft").maybeSingle();
  if (!row) return null;
  const sport = getSport(row.sport_slug);
  if (!sport) return null;
  const tid = row.id;

  const [teams, venues, rounds, matches, secrets, registrations] = await Promise.all([
    admin.from("teams").select("id, number, name, club_name, status, seed, bracket, checked_in_at").eq("tournament_id", tid),
    admin.from("venues").select("id, label, position, reserved_for_finals, available").eq("tournament_id", tid),
    admin.from("rounds").select("id, bracket, phase, number, status, seed, drawn_at").eq("tournament_id", tid),
    admin
      .from("matches")
      .select(
        "id, round_id, position, pool, team_a_id, team_b_id, side_a, side_b, venue_id, scheduled_at, started_at, ended_at, queued_at, score_a, score_b, tiebreak_a, tiebreak_b, winner_side, status",
      )
      .eq("tournament_id", tid),
    opts.secrets ? admin.from("team_secrets").select("team_id, code, teams!inner(tournament_id)").eq("teams.tournament_id", tid) : Promise.resolve({ data: [] }),
    admin.from("registrations").select("id, team_id, source").eq("tournament_id", tid),
  ]);
  const teamIds = (teams.data ?? []).map((t) => t.id);
  const players = teamIds.length
    ? await admin.from("players").select("id, team_id, first_name, last_name, position").in("team_id", teamIds)
    : { data: [] };

  const { clubs, ...rest } = row as typeof row & { clubs: { name: string; slug: string } | null };
  const meta: TournamentMeta = { ...rest, club: clubs };
  const state = rowsToEngineState(
    {
      tournament: { id: tid, status: row.status, starts_at: row.starts_at, max_teams: row.max_teams },
      teams: teams.data ?? [],
      players: players.data ?? [],
      venues: venues.data ?? [],
      rounds: rounds.data ?? [],
      matches: matches.data ?? [],
      teamSecrets: (secrets.data ?? []) as Record<string, unknown>[],
      registrations: registrations.data ?? [],
    },
    rulesFromSport(sport, row.team_format),
    resolveConfig(row.config, sport),
  );
  return { meta, sport, state, version: row.state_version };
}
