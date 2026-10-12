"use server";
import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSport } from "@orgasport/sports";
import { fmt, getMessages } from "@/i18n";
import { renderEmail, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import {
  CLUB_LOGO_BUCKET,
  checkInvitation,
  clubTag,
  getClubContext,
  getClubRow,
  listClubMembers,
  newInvitationToken,
  type ClubContext,
} from "@/lib/data/clubs";
import { CLUB_KINDS, canEditMember, formatLongDate, normalizeLink } from "@/components/club/model";
import type { ActionState } from "@/components/club/action-state";

/*
 * Club space server actions. Every action re-checks on the server who is
 * signed in and their role in the club they currently manage (the club id
 * is never taken from the form), and RLS checks it again for user-client
 * writes. The service role is used only after that check, for what RLS
 * forbids on purpose (invitation hashes, storage uploads, other people's
 * profiles).
 */

type ErrorCode = keyof ReturnType<typeof getMessages>["clubSpace"]["errors"];

const texts = () => getMessages().clubSpace;
const fail = (code: ErrorCode): ActionState => ({ ok: false, error: texts().errors[code] });
const done = (message: string, link?: string): ActionState => ({ ok: true, message, ...(link ? { link } : {}) });
const field = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : "";
};
const uuid = z.string().uuid();

type Gate = { ok: true; ctx: ClubContext } | { ok: false; state: ActionState };

/** Signed in, managing a club, owner or admin of it. */
async function requireClubAdmin(): Promise<Gate> {
  if (!(await getViewer())) return { ok: false, state: fail("auth") };
  const ctx = await getClubContext();
  if (!ctx?.isAdmin) return { ok: false, state: fail("forbidden") };
  return { ok: true, ctx };
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export async function deleteDraft(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const gate = await requireClubAdmin();
  if (!gate.ok) return gate.state;
  const id = uuid.safeParse(field(fd, "id"));
  if (!id.success) return fail("notFound");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .delete()
    .eq("id", id.data)
    .eq("club_id", gate.ctx.club.id)
    .eq("status", "draft")
    .select("id");
  // 23503: a payment row references the draft (kept for accounting).
  if (error) return fail(error.code === "23503" ? "hasPayments" : "save");
  if (!data.length) return fail("notFound");

  // Best effort: poster and rules uploaded for this draft.
  try {
    const admin = createAdminClient();
    const { data: files } = await admin.storage.from("tournament-media").list(id.data);
    if (files?.length) await admin.storage.from("tournament-media").remove(files.map((f) => `${id.data}/${f.name}`));
  } catch (e) {
    console.error("[club] draft media cleanup failed", e);
  }
  revalidatePath("/club");
  return done(texts().dashboard.drafts.deleted);
}

// ---------------------------------------------------------------------------
// Members and invitations
// ---------------------------------------------------------------------------

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["admin", "member"]),
});

export async function inviteMember(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const gate = await requireClubAdmin();
  if (!gate.ok) return gate.state;
  const parsed = inviteSchema.safeParse({ email: field(fd, "email"), role: field(fd, "role") });
  if (!parsed.success) return fail(parsed.error.issues.some((i) => i.path[0] === "email") ? "email" : "invalid");
  const { email, role } = parsed.data;
  const { viewer, club } = gate.ctx;
  const t = texts();

  const members = await listClubMembers(club.id);
  if (members.some((member) => member.email?.toLowerCase() === email)) return fail("alreadyMember");

  const admin = createAdminClient();
  // A new link replaces any link still pending for the same address.
  await admin.from("club_invitations").delete().eq("club_id", club.id).eq("email", email).is("accepted_at", null);
  const { token, hash } = newInvitationToken();
  const { data: invitation, error } = await admin
    .from("club_invitations")
    .insert({ club_id: club.id, email, role, token_hash: hash, invited_by: viewer.id })
    .select("expires_at")
    .single();
  if (error || !invitation) return fail("save");

  const link = `${env.siteUrl}/club/rejoindre/${token}`;
  const mail = t.members.email;
  const brand = getMessages().meta.title;
  const vars = { club: club.name, inviter: viewer.profile?.display_name || mail.someone, role: t.roleNouns[role] };
  const { html, text } = renderEmail({
    brand,
    title: fmt(mail.title, vars),
    preheader: fmt(mail.preheader, vars),
    blocks: [
      { kind: "paragraph", text: fmt(mail.intro, vars) },
      { kind: "button", label: mail.button, url: link },
      { kind: "paragraph", text: fmt(mail.expiry, { date: formatLongDate(invitation.expires_at), email }) },
      { kind: "note", text: mail.ignore },
    ],
    footer: [mail.footer],
  });
  const sent = await sendEmail({ to: email, subject: fmt(mail.subject, vars), text, html, replyTo: viewer.email ?? undefined });

  revalidatePath("/club/membres");
  // Without a delivered email, the admin can pass the link on themselves.
  return sent.ok ? done(fmt(t.members.invite.sent, { email })) : done(fmt(t.members.invite.notSent, { email }), link);
}

export async function revokeInvitation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const gate = await requireClubAdmin();
  if (!gate.ok) return gate.state;
  const id = uuid.safeParse(field(fd, "id"));
  if (!id.success) return fail("notFound");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("club_invitations")
    .delete()
    .eq("id", id.data)
    .eq("club_id", gate.ctx.club.id)
    .is("accepted_at", null)
    .select("id");
  if (error) return fail("save");
  if (!data.length) return fail("notFound");
  revalidatePath("/club/membres");
  return done(texts().members.pending.revoked);
}

/** Loads the target membership and applies the rules (never the owner, never oneself). */
async function editableMember(gate: { ctx: ClubContext }, rawUserId: string): Promise<{ ok: true; userId: string } | { ok: false; state: ActionState }> {
  const userId = uuid.safeParse(rawUserId);
  if (!userId.success) return { ok: false, state: fail("notFound") };
  const { viewer, club } = gate.ctx;
  const supabase = await createClient();
  const { data: target } = await supabase.from("club_members").select("user_id, role").eq("club_id", club.id).eq("user_id", userId.data).maybeSingle();
  if (!target) return { ok: false, state: fail("notFound") };
  if (!canEditMember({ id: viewer.id, role: club.role }, { userId: target.user_id, role: target.role })) {
    return { ok: false, state: fail(target.role === "owner" ? "owner" : target.user_id === viewer.id ? "self" : "forbidden") };
  }
  return { ok: true, userId: target.user_id };
}

export async function changeMemberRole(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const gate = await requireClubAdmin();
  if (!gate.ok) return gate.state;
  const role = z.enum(["admin", "member"]).safeParse(field(fd, "role"));
  if (!role.success) return fail("invalid");
  const target = await editableMember(gate, field(fd, "userId"));
  if (!target.ok) return target.state;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("club_members")
    .update({ role: role.data })
    .eq("club_id", gate.ctx.club.id)
    .eq("user_id", target.userId)
    .neq("role", "owner")
    .select("user_id");
  if (error || !data.length) return fail("save");
  revalidatePath("/club/membres");
  return done(texts().members.roleChanged);
}

export async function removeMember(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const gate = await requireClubAdmin();
  if (!gate.ok) return gate.state;
  const target = await editableMember(gate, field(fd, "userId"));
  if (!target.ok) return target.state;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("club_members")
    .delete()
    .eq("club_id", gate.ctx.club.id)
    .eq("user_id", target.userId)
    .neq("role", "owner")
    .select("user_id");
  if (error || !data.length) return fail("save");
  // Their profile no longer points at a club they cannot manage.
  await createAdminClient().from("profiles").update({ active_club_id: null }).eq("id", target.userId).eq("active_club_id", gate.ctx.club.id);
  revalidatePath("/club/membres");
  return done(texts().members.removed);
}

/** Accepts an invitation for the signed-in person, then opens the club space. */
export async function acceptInvitation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer) return fail("auth");
  const t = texts().join.errors;
  const check = await checkInvitation(field(fd, "token"), viewer.email, new Date());
  if (!check.ok) return { ok: false, error: check.reason === "wrongEmail" ? fmt(t.wrongEmail, { email: check.email ?? "" }) : t[check.reason] };
  const invitation = check.invitation;

  const admin = createAdminClient();
  // Never trust an address that was not confirmed (same rule as co-organizers).
  const { data: account } = await admin.auth.admin.getUserById(viewer.id);
  if (!account.user?.email_confirmed_at) return { ok: false, error: t.unconfirmed };

  // Claim the invitation first: a link works once, even if clicked twice.
  const now = new Date().toISOString();
  const { data: claimed } = await admin
    .from("club_invitations")
    .update({ accepted_at: now, accepted_by: viewer.id })
    .eq("id", invitation.id)
    .is("accepted_at", null)
    .select("id");
  if (!claimed?.length) return { ok: false, error: t.used };

  // Already a member: keep the current role (an invitation never demotes).
  const { error } = await admin
    .from("club_members")
    .upsert({ club_id: invitation.clubId, user_id: viewer.id, role: invitation.role }, { onConflict: "club_id,user_id", ignoreDuplicates: true });
  if (error) {
    await admin.from("club_invitations").update({ accepted_at: null, accepted_by: null }).eq("id", invitation.id);
    return fail("save");
  }
  await admin.from("profiles").update({ active_club_id: invitation.clubId }).eq("id", viewer.id);
  revalidatePath("/", "layout");
  redirect("/club");
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

const announcementSchema = z.object({
  title: z.string().trim().min(3).max(140),
  body: z.string().trim().max(2000),
});

/** The public club page and the feeds show announcements. */
function announcementsChanged(slug: string) {
  updateTag(clubTag(slug));
  revalidateTag("announcements", "max");
  revalidatePath("/club/annonces");
}

export async function createAnnouncement(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const gate = await requireClubAdmin();
  if (!gate.ok) return gate.state;
  const parsed = announcementSchema.safeParse({ title: field(fd, "title"), body: field(fd, "body") });
  if (!parsed.success) return fail(parsed.error.issues.some((i) => i.path[0] === "title") ? "title" : "invalid");
  const link = normalizeLink(field(fd, "link"));
  if (link === "invalid") return fail("url");
  const { club, viewer } = gate.ctx;
  const sport = field(fd, "sport");
  if (sport) {
    const row = await getClubRow(club.id);
    if (!row?.sports.includes(sport) || !getSport(sport)) return fail("sport");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert({
    club_id: club.id,
    title: parsed.data.title,
    body: parsed.data.body || null,
    link_url: link,
    sport_slug: sport || null,
    published_at: fd.get("publish") ? new Date().toISOString() : null,
    created_by: viewer.id,
  });
  if (error) return fail("save");
  announcementsChanged(club.slug);
  return done(texts().announcements.form.created);
}

export async function setAnnouncementPublished(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const gate = await requireClubAdmin();
  if (!gate.ok) return gate.state;
  const id = uuid.safeParse(field(fd, "id"));
  if (!id.success) return fail("notFound");
  const publish = field(fd, "publish") === "1";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .update({ published_at: publish ? new Date().toISOString() : null })
    .eq("id", id.data)
    .eq("club_id", gate.ctx.club.id)
    .select("id");
  if (error) return fail("save");
  if (!data.length) return fail("notFound");
  announcementsChanged(gate.ctx.club.slug);
  return done(texts().announcements.updated);
}

export async function deleteAnnouncement(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const gate = await requireClubAdmin();
  if (!gate.ok) return gate.state;
  const id = uuid.safeParse(field(fd, "id"));
  if (!id.success) return fail("notFound");
  const supabase = await createClient();
  const { data, error } = await supabase.from("announcements").delete().eq("id", id.data).eq("club_id", gate.ctx.club.id).select("id");
  if (error) return fail("save");
  if (!data.length) return fail("notFound");
  announcementsChanged(gate.ctx.club.slug);
  return done(texts().announcements.deleted);
}

// ---------------------------------------------------------------------------
// Club info and logo
// ---------------------------------------------------------------------------

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);
const coordinate = (limit: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().min(-limit).max(limit).nullable());

const infoSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(CLUB_KINDS),
  sports: z
    .array(z.string())
    .min(1)
    .max(20)
    .refine((list) => list.every((s) => getSport(s)?.enabled)),
  description: optional(2000),
  address: optional(200),
  city: optional(80),
  postcode: optional(10),
  lat: coordinate(90),
  lng: coordinate(180),
  default_venue_count: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().int().min(1).max(500).nullable()),
  contact_name: optional(80),
  contact_email: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === "" || z.string().email().safeParse(v).success)
    .transform((v) => v || null),
  contact_phone: optional(30),
  federation: optional(80),
  affiliation_number: optional(40),
});

const INFO_ERRORS: Partial<Record<string, ErrorCode>> = {
  name: "name",
  sports: "sports",
  default_venue_count: "venues",
  contact_email: "email",
};

export async function updateClubInfo(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const gate = await requireClubAdmin();
  if (!gate.ok) return gate.state;
  const keys = Object.keys(infoSchema.shape).filter((k) => k !== "sports");
  const parsed = infoSchema.safeParse({
    ...Object.fromEntries(keys.map((k) => [k, field(fd, k)])),
    sports: fd.getAll("sports").filter((v): v is string => typeof v === "string"),
  });
  if (!parsed.success) {
    const key = String(parsed.error.issues[0]?.path[0] ?? "");
    return fail(INFO_ERRORS[key] ?? "invalid");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("clubs").update(parsed.data).eq("id", gate.ctx.club.id).select("id");
  if (error || !data.length) return fail("save");
  updateTag(clubTag(gate.ctx.club.slug));
  // The club name also shows in the profile switcher and navigation.
  revalidatePath("/", "layout");
  return done(texts().info.saved);
}

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export async function uploadClubLogo(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const gate = await requireClubAdmin();
  if (!gate.ok) return gate.state;
  const file = fd.get("logo");
  if (!(file instanceof File) || file.size === 0) return fail("invalid");
  const ext = LOGO_TYPES[file.type];
  if (!ext) return fail("logoType");
  if (file.size > LOGO_MAX_BYTES) return fail("logoSize");

  const { club } = gate.ctx;
  const row = await getClubRow(club.id);
  const path = `${club.id}/logo.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from(CLUB_LOGO_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
  if (error) return fail("save");
  if (row?.logo_path && row.logo_path !== path) await admin.storage.from(CLUB_LOGO_BUCKET).remove([row.logo_path]);

  const supabase = await createClient();
  // Also bumps updated_at, which versions the public URL (same path, new image).
  const { error: updateError } = await supabase.from("clubs").update({ logo_path: path }).eq("id", club.id);
  if (updateError) return fail("save");
  updateTag(clubTag(club.slug));
  revalidatePath("/club", "layout");
  return done(texts().info.logo.saved);
}

export async function removeClubLogo(_prev: ActionState): Promise<ActionState> {
  const gate = await requireClubAdmin();
  if (!gate.ok) return gate.state;
  const { club } = gate.ctx;
  const row = await getClubRow(club.id);
  if (!row?.logo_path) return done(texts().info.logo.removed);
  const supabase = await createClient();
  const { error } = await supabase.from("clubs").update({ logo_path: null }).eq("id", club.id);
  if (error) return fail("save");
  await createAdminClient().storage.from(CLUB_LOGO_BUCKET).remove([row.logo_path]);
  updateTag(clubTag(club.slug));
  revalidatePath("/club", "layout");
  return done(texts().info.logo.removed);
}
