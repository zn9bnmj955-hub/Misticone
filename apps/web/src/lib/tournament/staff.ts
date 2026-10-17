import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Who may run the scoring table of a tournament: a signed-in organizer (club
 * admin or named staff) or a volunteer who typed a valid PIN. A PIN session
 * is a signed cookie limited to one tournament and revocable at any time.
 */
export type StaffActor =
  | { kind: "account"; userId: string; staffId: string | null; label: string; canManageAccess: boolean }
  | { kind: "pin"; staffId: string; label: string };

export const pinCookieName = (code: string) => `os_pin_${code}`;
const SESSION_HOURS = 24;

function secret(): string {
  const s = process.env.STAFF_SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("STAFF_SESSION_SECRET is not set (16+ characters)");
  return s;
}

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signPinSession(tournamentId: string, staffId: string): Promise<{ value: string; maxAge: number }> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ t: tournamentId, s: staffId, e: Date.now() + SESSION_HOURS * 3600_000 })));
  return { value: `${payload}.${await hmac(payload)}`, maxAge: SESSION_HOURS * 3600 };
}

async function readPinSession(code: string, tournamentId: string): Promise<string | null> {
  const raw = (await cookies()).get(pinCookieName(code))?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEqual(sig, await hmac(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { t: string; s: string; e: number };
    if (data.t !== tournamentId || data.e < Date.now()) return null;
    return data.s;
  } catch {
    return null;
  }
}

async function isClubOrPlatformAdmin(supabase: Awaited<ReturnType<typeof createClient>>, tournamentId: string): Promise<boolean> {
  const { data: platform } = await supabase.rpc("is_platform_admin");
  if (platform) return true;
  const { data: t } = await supabase.from("tournaments").select("club_id").eq("id", tournamentId).maybeSingle();
  if (!t?.club_id) return false;
  const { data: clubAdmin } = await supabase.rpc("is_club_admin", { p_club: t.club_id });
  return Boolean(clubAdmin);
}

/**
 * `status`: once the tournament is closed for good (archived), a PIN no longer
 * opens anything (the signed-in organizer still sees the read-only table).
 */
export async function getStaffActor(tournament: { id: string; short_code: string | null; status?: string }): Promise<StaffActor | null> {
  // 1. Signed-in organizer.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (userId) {
    const { data: allowed } = await supabase.rpc("can_manage_tournament", { p_tournament: tournament.id });
    if (allowed) {
      const [{ data: profile }, { data: staff }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
        supabase.from("tournament_staff").select("id, role").eq("tournament_id", tournament.id).eq("user_id", userId).is("revoked_at", null).maybeSingle(),
      ]);
      // Creating or revoking access is reserved to the organizer, a club admin or a platform admin
      // (no staff row means access came from the club or the platform).
      const canManageAccess = !staff || staff.role === "organizer" || (await isClubOrPlatformAdmin(supabase, tournament.id));
      return { kind: "account", userId, staffId: staff?.id ?? null, label: profile?.display_name || (data?.claims?.email as string) || "Organisateur", canManageAccess };
    }
  }
  // 2. Volunteer with a PIN (never after the closing).
  if (!tournament.short_code || tournament.status === "archived") return null;
  const staffId = await readPinSession(tournament.short_code, tournament.id);
  if (!staffId) return null;
  const { data: staff } = await createAdminClient()
    .from("tournament_staff")
    .select("id, label, revoked_at")
    .eq("id", staffId)
    .eq("tournament_id", tournament.id)
    .maybeSingle();
  if (!staff || staff.revoked_at) return null;
  return { kind: "pin", staffId: staff.id, label: staff.label };
}
