import "server-only";
import { cache } from "react";
import type { Enums } from "@orgasport/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicTeamLabel } from "@/lib/names";

/**
 * Public list of the teams registered to a tournament ("Liste des inscrits").
 * Read with the service client because the public never reads `players`
 * directly: only the public label (full names or initials, the organizer's
 * choice) leaves the server. Licenses, contacts and user ids are never
 * selected.
 */
export type RegistrantStatus = "registered" | "checked_in" | "waitlist" | "forfeit";

export type Registrant = {
  number: number;
  label: string;
  club: string | null;
  status: RegistrantStatus;
};

export type Roster = {
  /** Live tournament status (the cached page data may be a minute old). */
  status: Enums<"tournament_status">;
  /** Registered teams first (by number), then the waiting list (in arrival order). */
  teams: Registrant[];
  /** Teams holding a place (not on the waiting list, not withdrawn). */
  active: number;
  waitlist: number;
};

export type RosterTeamRow = {
  number: number;
  name: string | null;
  club_name: string | null;
  status: Enums<"team_status">;
  players: { first_name: string; last_name: string; position: number }[];
};

/** Pure mapping (unit tested): masks names, drops withdrawn teams, orders the list. */
export function toRoster(
  status: Enums<"tournament_status">,
  rows: RosterTeamRow[],
  nameDisplay: Enums<"name_display">,
): Roster {
  const teams: Registrant[] = rows
    .filter((r) => r.status !== "withdrawn")
    .map((r) => {
      const players = [...r.players].sort((a, b) => a.position - b.position);
      const label = publicTeamLabel({ name: r.name, number: r.number }, players, nameDisplay);
      const club = r.club_name?.trim() || null;
      return { number: r.number, label, club, status: r.status as RegistrantStatus };
    })
    .sort((a, b) => Number(a.status === "waitlist") - Number(b.status === "waitlist") || a.number - b.number);
  const waitlist = teams.filter((t) => t.status === "waitlist").length;
  return { status, teams, active: teams.length - waitlist, waitlist };
}

/**
 * Current roster of a tournament, read once per request (the CTA, the places
 * gauge and the list share it). Not cached across requests: the page
 * refreshes it every 30 s and on live updates.
 */
export const getRoster = cache(async (tournamentId: string, nameDisplay: Enums<"name_display">): Promise<Roster | null> => {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tournaments")
    .select("status, teams (number, name, club_name, status, players (first_name, last_name, position))")
    .eq("id", tournamentId)
    .neq("status", "draft")
    .maybeSingle();
  if (error || !data) return null;
  return toRoster(data.status, data.teams as RosterTeamRow[], nameDisplay);
});

/** Team numbers the signed-in person plays in (registered with their account). */
export const getMyTeamNumbers = cache(async (tournamentId: string, userId: string): Promise<number[]> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("players")
    .select("teams!inner (number, tournament_id)")
    .eq("user_id", userId)
    .eq("teams.tournament_id", tournamentId);
  return (data ?? []).map((p) => (p.teams as { number: number }).number);
});
