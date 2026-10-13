"use server";
import { cookies } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { getSport, isValidLicenseNumber } from "@orgasport/sports";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ONBOARDED_COOKIE, ONE_YEAR, PREFS_COOKIE, serializePrefs } from "@/lib/prefs";

type Result = { ok: true; redirect: string } | { ok: false; error: string };

const sportsSchema = z.array(z.string().regex(/^[a-z0-9-]+$/)).max(20).refine((list) => list.every((s) => getSport(s)), "unknown sport");

const placeSchema = z.object({
  city: z.string().max(80).optional(),
  postcode: z.string().max(10).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

async function rememberOnDevice(prefs: { sports: string[]; city?: string; postcode?: string; lat?: number; lng?: number; radiusKm?: number }) {
  const store = await cookies();
  const opts = { path: "/", maxAge: ONE_YEAR, sameSite: "lax" as const };
  store.set(PREFS_COOKIE, serializePrefs(prefs), opts);
  store.set(ONBOARDED_COOKIE, "1", opts);
}

const playerSchema = z.object({
  sports: sportsSchema,
  level: z.enum(["leisure", "competition"]).nullable(),
  licensed: z.boolean().nullable(),
  licenseNumber: z.string().max(20).optional(),
  place: placeSchema,
  radiusKm: z.number().int().min(1).max(500),
  feed: z.object({ nearby: z.boolean(), results: z.boolean(), news: z.boolean(), clubs: z.boolean() }),
  notifications: z.boolean().nullable(),
});
export type PlayerOnboarding = z.infer<typeof playerSchema>;

export async function completePlayerOnboarding(input: PlayerOnboarding): Promise<Result> {
  const parsed = playerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  await rememberOnDevice({ sports: d.sports, ...d.place, radiusKm: d.radiusKm });
  if (!user) return { ok: true, redirect: "/accueil" };

  const { error } = await supabase
    .from("profiles")
    .update({
      sports: d.sports,
      level: d.level,
      is_licensed: d.licensed,
      city: d.place.city ?? null,
      postcode: d.place.postcode ?? null,
      lat: d.place.lat ?? null,
      lng: d.place.lng ?? null,
      search_radius_km: d.radiusKm,
      feed_prefs: d.feed,
      notifications_opt_in: d.notifications ?? false,
      active_club_id: null,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: "save" };

  const license = d.licenseNumber?.trim();
  if (d.licensed && license) {
    // Format check against the first chosen sport that defines one.
    const sport = d.sports.map(getSport).find((s) => s?.license.numberPattern);
    if (!sport || isValidLicenseNumber(sport, license)) {
      await supabase.from("profiles_private").update({ license_number: license }).eq("user_id", user.id);
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, redirect: "/accueil" };
}

const clubSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["federated_club", "association", "festival_committee", "town_hall", "company", "other"]),
  sports: sportsSchema.refine((l) => l.length > 0),
  federation: z.string().trim().max(60).optional(),
  affiliationNumber: z.string().trim().max(40).optional(),
  address: z.string().trim().max(200).optional(),
  place: placeSchema,
  venues: z.number().int().min(1).max(500).nullable(),
  contactName: z.string().trim().max(80).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  contactEmail: z.union([z.literal(""), z.email().max(120)]).optional(),
});
export type ClubOnboarding = z.infer<typeof clubSchema>;

function slugify(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "club"
  );
}

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function createClubFromOnboarding(input: ClubOnboarding, logo: FormData | null): Promise<Result> {
  const parsed = clubSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return { ok: false, error: "auth" };

  const base = slugify(d.name);
  let club: { id: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 5 && !club; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const { data, error } = await supabase
      .from("clubs")
      .insert({
        slug,
        name: d.name,
        kind: d.kind,
        sports: d.sports,
        federation: d.federation || null,
        affiliation_number: d.affiliationNumber || null,
        address: d.address || null,
        city: d.place.city ?? null,
        postcode: d.place.postcode ?? null,
        lat: d.place.lat ?? null,
        lng: d.place.lng ?? null,
        default_venue_count: d.venues,
        contact_name: d.contactName || null,
        contact_phone: d.contactPhone || null,
        contact_email: d.contactEmail || user.email || null,
        created_by: user.id,
      })
      .select("id, slug")
      .single();
    if (data) club = data;
    else if (error && error.code !== "23505") return { ok: false, error: "save" };
  }
  if (!club) return { ok: false, error: "save" };
  revalidateTag("clubs", "max"); // « Nouveau club » in the feeds.

  const file = logo?.get("logo");
  if (file instanceof File && file.size > 0 && file.size <= 2 * 1024 * 1024 && LOGO_TYPES[file.type]) {
    const admin = createAdminClient();
    const path = `${club.id}/logo.${LOGO_TYPES[file.type]}`;
    const { error } = await admin.storage.from("club-logos").upload(path, file, { upsert: true, contentType: file.type });
    if (!error) await admin.from("clubs").update({ logo_path: path }).eq("id", club.id);
  }

  const { data: profile } = await supabase.from("profiles").select("display_name, sports").eq("id", user.id).single();
  await supabase
    .from("profiles")
    .update({
      active_club_id: club.id,
      onboarded_at: new Date().toISOString(),
      display_name: profile?.display_name || d.contactName || null,
      sports: profile?.sports?.length ? profile.sports : d.sports,
    })
    .eq("id", user.id);

  await rememberOnDevice({ sports: d.sports, ...d.place });
  revalidatePath("/", "layout");
  return { ok: true, redirect: "/accueil" };
}

/** Instagram-style profile switch: player profile (null) or one of my clubs. */
export async function switchProfile(clubId: string | null): Promise<Result> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "auth" };
  const { error } = await supabase.from("profiles").update({ active_club_id: clubId }).eq("id", auth.user.id);
  if (error) return { ok: false, error: "forbidden" };
  revalidatePath("/", "layout");
  return { ok: true, redirect: "/accueil" };
}
