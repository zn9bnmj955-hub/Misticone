import "server-only";
import type { Tables } from "@orgasport/db";
import { getSport, enabledSports, type SportConfig } from "@orgasport/sports";
import type { createClient } from "@/lib/supabase/server";
import { isoToParis, type FormContext } from "@/lib/tournament-form";

/**
 * Server-side access to a tournament draft, shared by the editor page and the
 * creation form's server actions. Everything runs with the signed-in user's
 * client (RLS) and an explicit club membership check on top of it.
 */
type UserClient = Awaited<ReturnType<typeof createClient>>;

export const CLUB_CONTEXT_COLUMNS =
  "id, name, sports, address, postcode, city, lat, lng, default_venue_count, contact_name, contact_email, contact_phone" as const;

export type ClubContextRow = Pick<
  Tables<"clubs">,
  "id" | "name" | "sports" | "address" | "postcode" | "city" | "lat" | "lng" | "default_venue_count" | "contact_name" | "contact_email" | "contact_phone"
>;

/** What the defaults need to know about the club and the organizer. */
export function formContextOf(club: ClubContextRow, person: { name?: string | null; email?: string | null }, nowMs: number): FormContext {
  return {
    club: {
      name: club.name,
      address: club.address,
      postcode: club.postcode,
      city: club.city,
      lat: club.lat,
      lng: club.lng,
      default_venue_count: club.default_venue_count,
      contact_name: club.contact_name,
      contact_email: club.contact_email,
      contact_phone: club.contact_phone,
    },
    person,
    nowMs,
  };
}

/** Today's calendar date in Paris ("YYYY-MM-DD"), for "date in the past" checks. */
export function todayParis(): string {
  return isoToParis(new Date().toISOString()).date;
}

/** Sport of a draft: the column if still offered, else the first enabled sport. */
export function draftSport(slug: string | null | undefined): SportConfig {
  const sport = slug ? getSport(slug) : undefined;
  return sport?.enabled ? sport : enabledSports()[0]!;
}

export type DraftRow = Pick<Tables<"tournaments">, "id" | "club_id" | "status" | "sport_slug" | "name" | "draft_form" | "draft_step" | "updated_at">;

export type DraftAccess =
  | { ok: true; tournament: DraftRow; role: Tables<"club_members">["role"] }
  | { ok: false; error: "not_found" | "not_draft"; tournament?: DraftRow };

/**
 * The draft if `userId` is a member of its club. Not found and not a member
 * look the same from outside (no information leak).
 */
export async function loadDraftAccess(supabase: UserClient, userId: string, id: string): Promise<DraftAccess> {
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, club_id, status, sport_slug, name, draft_form, draft_step, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!tournament) return { ok: false, error: "not_found" };
  const { data: member } = await supabase
    .from("club_members")
    .select("role")
    .eq("club_id", tournament.club_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { ok: false, error: "not_found" };
  if (tournament.status !== "draft") return { ok: false, error: "not_draft", tournament };
  return { ok: true, tournament, role: member.role };
}
