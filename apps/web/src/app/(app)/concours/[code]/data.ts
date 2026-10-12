import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getSport, type CompetitionFormat } from "@orgasport/sports";
import type { Tables } from "@orgasport/db";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Public facts of a tournament for its details page. Read as "anon" (RLS:
 * drafts are invisible) and cached a few minutes; registrations and
 * publication revalidate the "tournaments" tag. Live parts (roster, status,
 * registration window) are read per request, see lib/data/registrants.ts.
 */
export type TournamentDetail = Pick<
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
  | "registration_mode"
  | "waitlist_enabled"
  | "max_teams"
  | "name_display"
  | "fee_cents"
  | "fee_per"
  | "prize_text"
  | "welcome_message"
  | "rules_text"
  | "contact_name"
  | "contact_phone"
  | "config"
> & {
  club: { name: string; slug: string } | null;
  /** Competition format: the tournament's choice or the sport default. */
  format: CompetitionFormat | null;
  posterUrl: string | null;
  rulesPdfUrl: string | null;
};

const COLUMNS =
  "id, short_code, name, status, sport_slug, starts_at, registration_closes_at, checkin_closes_at, address, postcode, city, lat, lng, parking, food, team_format, category, eligibility, registration_mode, waitlist_enabled, max_teams, name_display, fee_cents, fee_per, prize_text, welcome_message, rules_text, contact_name, contact_phone, config, poster_path, rules_pdf_path, clubs (name, slug)";

const MEDIA_BUCKET = "tournament-media";

export async function getTournamentDetail(code: string): Promise<TournamentDetail | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("tournaments", `tournament:${code}`);
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("tournaments").select(COLUMNS).eq("short_code", code).neq("status", "draft").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { clubs, poster_path, rules_pdf_path, ...rest } = data as typeof data & { clubs: { name: string; slug: string } | null };
  const media = (path: string | null) => (path ? supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl : null);
  const configured = (rest.config as { format?: unknown } | null)?.format;
  const sport = getSport(rest.sport_slug);
  const format =
    sport && typeof configured === "string" && (sport.competitionFormats as string[]).includes(configured)
      ? (configured as CompetitionFormat)
      : (sport?.defaults.competitionFormat ?? null);
  return { ...rest, club: clubs, format, posterUrl: media(poster_path), rulesPdfUrl: media(rules_pdf_path) };
}
