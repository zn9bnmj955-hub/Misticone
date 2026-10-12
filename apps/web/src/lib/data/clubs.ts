import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import type { Tables } from "@orgasport/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { getViewer, type Viewer, type ViewerClub } from "@/lib/viewer";
import type { TournamentCard } from "@/lib/data/tournaments";
import { countTeams, isClubAdminRole, type StatsTournament } from "@/components/club/model";

export const CLUB_LOGO_BUCKET = "club-logos";

/** Cache tag of everything shown on the public page of a club. */
export const clubTag = (slug: string) => `club:${slug}`;

// ---------------------------------------------------------------------------
// Invitation tokens: the link carries a random token, the database only its hash.
// ---------------------------------------------------------------------------

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** 32 random bytes, base64url (43 characters), and the hash to store. */
export function newInvitationToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInvitationToken(token) };
}

export function isInvitationToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** Public URL of a logo. `version` (e.g. updated_at) busts caches after a re-upload at the same path. */
export function clubLogoUrl(path: string | null | undefined, version?: string | null): string | null {
  if (!path) return null;
  const url = createPublicClient().storage.from(CLUB_LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
  return version ? `${url}?v=${encodeURIComponent(version)}` : url;
}

export type ClubContext = { viewer: Viewer; club: ViewerClub; isAdmin: boolean };

/**
 * The signed-in person and the club they currently manage (profile switch),
 * or null. Reads the session: call it inside <Suspense> or a server action.
 */
export async function getClubContext(): Promise<ClubContext | null> {
  const viewer = await getViewer();
  const club = viewer?.activeClub;
  if (!viewer || !club) return null;
  return { viewer, club, isAdmin: isClubAdminRole(club.role) };
}

// ---------------------------------------------------------------------------
// Club space (signed-in members; RLS applies unless stated otherwise)
// ---------------------------------------------------------------------------

export type ClubRow = Tables<"clubs">;

export async function getClubRow(clubId: string): Promise<ClubRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("clubs").select("*").eq("id", clubId).maybeSingle();
  return data;
}

export type DashboardTournament = Pick<
  Tables<"tournaments">,
  "id" | "short_code" | "name" | "status" | "sport_slug" | "starts_at" | "max_teams" | "updated_at"
> & { activeTeams: number; waitlistTeams: number };

/** Every tournament of the club, drafts included, with live registration counts. */
export async function listDashboardTournaments(clubId: string): Promise<DashboardTournament[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, short_code, name, status, sport_slug, starts_at, max_teams, updated_at, teams (status)")
    .eq("club_id", clubId);
  if (error) throw error;
  return data.map(({ teams, ...t }) => {
    const c = countTeams(teams);
    return { ...t, activeTeams: c.active, waitlistTeams: c.waitlist };
  });
}

/**
 * Raw figures for the statistics page. Service role (players are private to
 * managers, a plain member would see zero): the CALLER checks membership.
 */
export async function loadClubStatsRows(clubId: string): Promise<StatsTournament[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tournaments")
    .select("status, sport_slug, starts_at, max_teams, fee_cents, fee_per, teams (status, players (count))")
    .eq("club_id", clubId);
  if (error) throw error;
  return data.map(({ teams, ...t }) => ({
    ...t,
    teams: teams.map((team) => ({ status: team.status, players: team.players[0]?.count ?? 0 })),
  }));
}

export async function listClubPayments(clubId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, created_at, paid_at, amount_cents, discount_cents, currency, promo_code, status, provider, receipt_url, invoice_url, checkout_url, expires_at, tournaments (id, name, short_code), pricing_plans (label)",
    )
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
}

export type ClubMember = { userId: string; role: ViewerClub["role"]; since: string; name: string | null; email: string | null };

/**
 * Members with their name and email. Profiles and emails of other people
 * are not readable through RLS: service role, the CALLER checks membership.
 */
export async function listClubMembers(clubId: string): Promise<ClubMember[]> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin.from("club_members").select("user_id, role, created_at").eq("club_id", clubId);
  if (error) throw error;
  const ids = rows.map((r) => r.user_id);
  const [{ data: profiles }, users] = await Promise.all([
    admin.from("profiles").select("id, display_name").in("id", ids),
    Promise.all(ids.map((id) => admin.auth.admin.getUserById(id).then((r) => r.data.user))),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const emails = new Map(users.flatMap((u) => (u ? [[u.id, u.email ?? null] as const] : [])));
  const rank = { owner: 0, admin: 1, member: 2 } as const;
  return rows
    .map((r) => ({ userId: r.user_id, role: r.role, since: r.created_at, name: names.get(r.user_id) ?? null, email: emails.get(r.user_id) ?? null }))
    .sort((a, b) => rank[a.role] - rank[b.role] || (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "", "fr"));
}

/** Invitations not accepted yet (RLS: club admins only; the token hash is never readable). */
export async function listPendingInvitations(clubId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("club_invitations")
    .select("id, email, role, created_at, expires_at")
    .eq("club_id", clubId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function listClubAnnouncements(clubId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, link_url, sport_slug, published_at, created_at")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

/** A tournament of one of the viewer's clubs, for its management page. */
export async function getManagedTournament(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tournaments")
    .select(
      "id, club_id, short_code, name, status, sport_slug, starts_at, address, postcode, city, team_format, max_teams, waitlist_enabled, fee_cents, fee_per, config",
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}

/** Teams with players and captain contacts. Players and contacts are only visible to managers (RLS). */
export async function listManagedRegistrations(tournamentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select(
      "id, number, name, club_name, status, created_at, players (first_name, last_name, position, is_substitute), registrations (captain_name, captain_phone, captain_email, source, created_at)",
    )
    .eq("tournament_id", tournamentId)
    .order("number");
  if (error) throw error;
  return data;
}

/** Organizers, co-organizers and PIN entries (never the PIN hash: column not granted). */
export async function listTournamentStaff(tournamentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tournament_staff")
    .select("id, role, label, email, user_id, revoked_at, created_at")
    .eq("tournament_id", tournamentId)
    .order("created_at");
  return data ?? [];
}

export async function listTournamentPayments(tournamentId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("id, amount_cents, discount_cents, currency, promo_code, provider, status, paid_at, created_at, receipt_url, invoice_url")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Invitations (service role: the hash is not readable through the API)
// ---------------------------------------------------------------------------

export type InvitationCheck =
  | { ok: true; invitation: { id: string; clubId: string; clubName: string; clubSlug: string; email: string; role: ViewerClub["role"] } }
  | { ok: false; reason: "invalid" | "expired" | "used" | "wrongEmail"; email?: string };

/** Looks an invitation up by its token and checks it can be accepted by `email`. */
export async function checkInvitation(token: string, email: string | null, now: Date): Promise<InvitationCheck> {
  if (!isInvitationToken(token)) return { ok: false, reason: "invalid" };
  const admin = createAdminClient();
  const { data } = await admin
    .from("club_invitations")
    .select("id, club_id, email, role, expires_at, accepted_at, clubs (name, slug)")
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle();
  if (!data?.clubs) return { ok: false, reason: "invalid" };
  if (data.accepted_at) return { ok: false, reason: "used" };
  if (new Date(data.expires_at).getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (!email || email.trim().toLowerCase() !== data.email.trim().toLowerCase()) return { ok: false, reason: "wrongEmail", email: data.email };
  return {
    ok: true,
    invitation: { id: data.id, clubId: data.club_id, clubName: data.clubs.name, clubSlug: data.clubs.slug, email: data.email, role: data.role },
  };
}

// ---------------------------------------------------------------------------
// Public club page (cached, anonymous client)
// ---------------------------------------------------------------------------

const CARD_COLUMNS =
  "id, short_code, name, status, sport_slug, starts_at, registration_closes_at, city, lat, lng, team_format, max_teams, fee_cents, fee_per, prize_text, eligibility, teams (status)";

export type PublicClub = {
  club: Pick<
    ClubRow,
    | "id"
    | "slug"
    | "name"
    | "kind"
    | "sports"
    | "city"
    | "postcode"
    | "description"
    | "contact_name"
    | "contact_email"
    | "contact_phone"
    | "federation"
    | "affiliation_number"
    | "updated_at"
  > & { logoUrl: string | null };
  upcoming: TournamentCard[];
  past: TournamentCard[];
  announcements: Pick<Tables<"announcements">, "id" | "title" | "body" | "link_url" | "sport_slug" | "published_at">[];
};

export async function getPublicClub(slug: string): Promise<PublicClub | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(clubTag(slug), "tournaments", "announcements");
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const supabase = createPublicClient();
  const { data: club } = await supabase
    .from("clubs")
    .select(
      "id, slug, name, kind, sports, city, postcode, description, contact_name, contact_email, contact_phone, federation, affiliation_number, logo_path, updated_at",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!club) return null;

  const [{ data: tournaments }, { data: announcements }] = await Promise.all([
    supabase.from("tournaments").select(CARD_COLUMNS).eq("club_id", club.id).neq("status", "draft").order("starts_at", { ascending: true }).limit(100),
    supabase
      .from("announcements")
      .select("id, title, body, link_url, sport_slug, published_at")
      .eq("club_id", club.id)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(10),
  ]);

  const cards: TournamentCard[] = (tournaments ?? []).map(({ teams, ...t }) => ({
    ...t,
    club: { name: club.name, slug: club.slug },
    teamCount: countTeams(teams).active,
  }));
  const { logo_path, ...rest } = club;
  return {
    club: { ...rest, logoUrl: clubLogoUrl(logo_path, club.updated_at) },
    upcoming: cards.filter((c) => c.status !== "finished" && c.status !== "archived"),
    past: cards.filter((c) => c.status === "finished" || c.status === "archived").reverse().slice(0, 20),
    announcements: announcements ?? [],
  };
}

export async function isFollowingClub(userId: string, clubId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("follows").select("id").eq("user_id", userId).eq("club_id", clubId).maybeSingle();
  return Boolean(data);
}
