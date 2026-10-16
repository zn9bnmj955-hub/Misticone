import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Tables } from "@orgasport/db";
import { createClient } from "@/lib/supabase/server";
import { ALL_SPORTS, PREFS_COOKIE, SPORT_COOKIE, normalizeSportFilter, onlyOfferedSports, parsePrefs, type DevicePrefs } from "@/lib/prefs";

export type ViewerClub = Pick<Tables<"clubs">, "id" | "name" | "slug" | "logo_path"> & {
  role: Tables<"club_members">["role"];
};

export type Viewer = {
  id: string;
  email: string | null;
  profile: Tables<"profiles"> | null;
  clubs: ViewerClub[];
  activeClub: ViewerClub | null;
  isAdmin: boolean;
};

/** The signed-in person, or null for a guest. Reads the session: call it inside <Suspense>. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const userId = claims.sub;

  const [profileRes, clubsRes, adminRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("club_members").select("role, clubs (id, name, slug, logo_path)").eq("user_id", userId),
    supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);

  const clubs: ViewerClub[] = (clubsRes.data ?? []).flatMap((row) =>
    row.clubs ? [{ ...row.clubs, role: row.role }] : [],
  );
  const profile = profileRes.data;
  const activeClub = clubs.find((c) => c.id === profile?.active_club_id) ?? null;

  return {
    id: userId,
    email: typeof claims.email === "string" ? claims.email : null,
    profile,
    clubs,
    activeClub,
    isAdmin: Boolean(adminRes.data),
  };
});

/** Preferences remembered on this device (guests and signed-in people alike). */
export async function getDevicePrefs(): Promise<DevicePrefs | null> {
  const store = await cookies();
  return parsePrefs(store.get(PREFS_COOKIE)?.value);
}

/** Current value of the story-style sport selector ("all" or a sport slug). */
export async function getSportFilter(): Promise<string> {
  const store = await cookies();
  const value = store.get(SPORT_COOKIE)?.value;
  return normalizeSportFilter(value && /^[a-z0-9-]+$/.test(value) ? value : null);
}

/** Sports for the personal feed: the selector if set, otherwise the chosen sports. */
export async function getFeedSports(viewer: Viewer | null): Promise<string[] | null> {
  const filter = await getSportFilter();
  if (filter !== ALL_SPORTS) return [filter];
  // Sports no longer offered (football) are left out.
  const fromProfile = onlyOfferedSports(viewer?.profile?.sports ?? []);
  if (fromProfile.length > 0) return fromProfile;
  const prefs = await getDevicePrefs();
  const fromDevice = onlyOfferedSports(prefs?.sports ?? []);
  return fromDevice.length ? fromDevice : null;
}
