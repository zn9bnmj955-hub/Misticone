import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getSport, venueLabel } from "@orgasport/sports";
import type { Tables } from "@orgasport/db";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { publicTeamLabel } from "@/lib/names";

export type TournamentCard = Pick<
  Tables<"tournaments">,
  | "id"
  | "short_code"
  | "name"
  | "status"
  | "sport_slug"
  | "starts_at"
  | "registration_closes_at"
  | "city"
  | "lat"
  | "lng"
  | "team_format"
  | "max_teams"
  | "fee_cents"
  | "fee_per"
  | "prize_text"
  | "eligibility"
> & { club: { name: string; slug: string } | null; teamCount: number; distanceKm?: number };

const CARD_COLUMNS =
  "id, short_code, name, status, sport_slug, starts_at, registration_closes_at, city, lat, lng, team_format, max_teams, fee_cents, fee_per, prize_text, eligibility, clubs (name, slug), teams (count)";

type CardRow = Omit<TournamentCard, "club" | "teamCount"> & {
  clubs: { name: string; slug: string } | null;
  teams: { count: number }[];
};

function toCard(row: CardRow): TournamentCard {
  const { clubs, teams, ...rest } = row;
  return { ...rest, club: clubs, teamCount: teams[0]?.count ?? 0 };
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Upcoming and live published tournaments, optionally filtered by sport. */
export async function listUpcomingTournaments(sports: string[] | null, limit = 20): Promise<TournamentCard[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("tournaments");
  const supabase = createPublicClient();
  let query = supabase
    .from("tournaments")
    .select(CARD_COLUMNS)
    .in("status", ["published", "registration_closed", "check_in", "live"])
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (sports && sports.length > 0) query = query.in("sport_slug", sports);
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as CardRow[]).map(toCard);
}

/** Sort by distance when we know where the person is. */
export function withDistance(cards: TournamentCard[], from: { lat?: number | null; lng?: number | null } | null | undefined) {
  if (from?.lat == null || from.lng == null) return cards;
  const origin = { lat: from.lat, lng: from.lng };
  return cards.map((c) => (c.lat != null && c.lng != null ? { ...c, distanceKm: distanceKm(origin, { lat: c.lat, lng: c.lng }) } : c));
}

const DAY = 24 * 60 * 60 * 1000;

/** Published tournaments whose registrations close within `days`. */
export function closingSoon(cards: TournamentCard[], days = 3): TournamentCard[] {
  const now = Date.now();
  return cards.filter(
    (c) => c.status === "published" && c.registration_closes_at && new Date(c.registration_closes_at).getTime() - now < days * DAY,
  );
}

export async function findTournamentByCode(code: string) {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("tournaments")
    .select("id, short_code, name, status, sport_slug, starts_at, address, city, postcode, team_format, max_teams, welcome_message, name_display, clubs (name, slug)")
    .eq("short_code", code)
    .neq("status", "draft")
    .maybeSingle();
  return data;
}

export type LiveStats = { liveTournaments: number; players: number; upcoming: number };

/** Headline numbers for the landing page. */
export async function getLiveStats(): Promise<LiveStats> {
  "use cache";
  cacheLife("minutes");
  cacheTag("stats");
  const admin = createAdminClient();
  const [live, upcoming, players] = await Promise.all([
    admin.from("tournaments").select("id", { count: "exact", head: true }).eq("status", "live"),
    admin.from("tournaments").select("id", { count: "exact", head: true }).in("status", ["published", "registration_closed", "check_in"]),
    admin
      .from("players")
      .select("id, teams!inner(tournaments!inner(status))", { count: "exact", head: true })
      .in("teams.tournaments.status", ["published", "registration_closed", "check_in", "live"]),
  ]);
  return { liveTournaments: live.count ?? 0, upcoming: upcoming.count ?? 0, players: players.count ?? 0 };
}

export type MyNextMatch = {
  tournament: { name: string; shortCode: string; sportSlug: string };
  teamNumber: number;
  status: Tables<"matches">["status"];
  venue: string | null;
  venueNoun: string;
  scheduledAt: string | null;
  opponent: string | null;
  opponentNumber: number | null;
  round: number;
  bracket: Tables<"rounds">["bracket"];
};

type TournamentRef = { id: string; name: string; short_code: string | null; sport_slug: string; name_display: Tables<"tournaments">["name_display"] };

/** Next (or last) match of a team, with the opponent named per the display rule. */
async function nextMatchForTeam(team: { id: string; number: number }, t: TournamentRef): Promise<MyNextMatch | null> {
  const admin = createAdminClient();
  const { data: matches } = await admin
    .from("matches")
    .select("id, status, scheduled_at, team_a_id, team_b_id, venues (label), rounds!inner(number, bracket)")
    .or(`team_a_id.eq.${team.id},team_b_id.eq.${team.id}`)
    .eq("tournament_id", t.id);
  if (!matches || matches.length === 0) return null;

  const pending = matches.filter((m) => !["done", "forfeit", "bye"].includes(m.status));
  const pool = pending.length > 0 ? pending : matches;
  const next = [...pool].sort((a, b) => b.rounds.number - a.rounds.number)[0]!;

  const opponentId = next.team_a_id === team.id ? next.team_b_id : next.team_a_id;
  let opponent: string | null = null;
  let opponentNumber: number | null = null;
  if (opponentId) {
    const { data: opp } = await admin
      .from("teams")
      .select("name, number, players (first_name, last_name, position)")
      .eq("id", opponentId)
      .single();
    if (opp) {
      opponentNumber = opp.number;
      const players = [...opp.players].sort((a, b) => a.position - b.position);
      opponent = publicTeamLabel(opp, players, t.name_display);
    }
  }
  const sport = getSport(t.sport_slug);
  return {
    tournament: { name: t.name, shortCode: t.short_code!, sportSlug: t.sport_slug },
    teamNumber: team.number,
    status: next.status,
    venue: next.venues?.label ?? null,
    venueNoun: sport ? venueLabel(sport) : "Terrain",
    scheduledAt: next.scheduled_at,
    opponent,
    opponentNumber,
    round: next.rounds.number,
    bracket: next.rounds.bracket,
  };
}

/**
 * The signed-in player's next match in a live tournament (the "Mon tirage"
 * shortcut). Uses the service client to read the opponent's names, then
 * applies the tournament's public display rule.
 */
export async function getMyNextMatch(userId: string): Promise<MyNextMatch | null> {
  const admin = createAdminClient();
  const { data: mine } = await admin
    .from("players")
    .select("team_id, teams!inner(id, number, tournament_id, tournaments!inner(id, name, short_code, sport_slug, status, name_display))")
    .eq("user_id", userId)
    .eq("teams.tournaments.status", "live");
  const entry = mine?.[0];
  if (!entry) return null;
  return nextMatchForTeam(entry.teams, entry.teams.tournaments);
}

/** Next match of team number N in a tournament (public lookup by number). */
export async function getTeamNextMatch(t: TournamentRef, teamNumber: number): Promise<MyNextMatch | null> {
  const admin = createAdminClient();
  const { data: team } = await admin.from("teams").select("id, number").eq("tournament_id", t.id).eq("number", teamNumber).maybeSingle();
  if (!team) return null;
  return nextMatchForTeam(team, t);
}

/** Club tournaments, drafts included. Runs as the signed-in user (RLS). */
export async function listClubTournaments(clubId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tournaments")
    .select("id, short_code, name, status, sport_slug, starts_at, max_teams, teams (count)")
    .eq("club_id", clubId)
    .order("starts_at", { ascending: true });
  // Live first, then upcoming (soonest first), then drafts, then past ones.
  const order: Record<string, number> = { live: 0, check_in: 1, registration_closed: 2, published: 3, draft: 4, finished: 5, archived: 6 };
  return (data ?? [])
    .map((t) => ({ ...t, teamCount: t.teams[0]?.count ?? 0 }))
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
}

export async function listAnnouncements(sports: string[] | null, limit = 5) {
  "use cache";
  cacheLife("minutes");
  cacheTag("announcements");
  const supabase = createPublicClient();
  let q = supabase
    .from("announcements")
    .select("id, title, body, published_at, sport_slug, clubs (name, slug)")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (sports && sports.length) q = q.or(`sport_slug.is.null,sport_slug.in.(${sports.join(",")})`);
  const { data } = await q;
  return data ?? [];
}
