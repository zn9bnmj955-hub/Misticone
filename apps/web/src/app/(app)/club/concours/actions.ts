"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Json, TablesUpdate } from "@orgasport/db";
import { getSport } from "@orgasport/sports";
import { getMessages } from "@/i18n";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { quoteFor } from "@/lib/payments/pricing";
import { startCheckout, type CheckoutError, type CheckoutResult } from "@/lib/payments/checkout";
import { normalizePromoCode, type PromoError } from "@/lib/payments/quote";
import { rateLimit, rateLimited } from "@/lib/tournament/http";
import { STEPS, defaultForm, draftSchema, validateForm, type FormIssue } from "@/lib/tournament-form";
import {
  CLUB_CONTEXT_COLUMNS,
  draftSport,
  formContextOf,
  loadDraftAccess,
  todayParis,
  type DraftAccess,
} from "@/components/tournament-form/draft-access";
import {
  MEDIA_BUCKET,
  MEDIA_KINDS,
  MEDIA_RULES,
  checkMediaFile,
  isMediaPathOf,
  mediaPath,
  sniffType,
  typeOfPath,
  type MediaKind,
} from "@/components/tournament-form/media";

/**
 * Server actions of the "Créer un concours" form. Every action checks the
 * session and the club membership again: they are public POST endpoints.
 * Drafts are written with the user's client (RLS); the service role is used
 * only for storage (uploads are checked here) and never for the draft itself.
 */

type Fail<E extends string = string> = { ok: false; error: E };
const fail = <E extends string>(error: E): Fail<E> => ({ ok: false, error });

const idSchema = z.uuid();
const kindSchema = z.enum(MEDIA_KINDS);

async function currentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

async function access(id: string): Promise<{ error: "auth" | "invalid" | "not_found" | "not_draft" } | { error: null; userId: string; draft: Extract<DraftAccess, { ok: true }> }> {
  if (!idSchema.safeParse(id).success) return { error: "invalid" };
  const { supabase, user } = await currentUser();
  if (!user) return { error: "auth" };
  const draft = await loadDraftAccess(supabase, user.id, id);
  if (!draft.ok) return { error: draft.error };
  return { error: null, userId: user.id, draft };
}

// ---------------------------------------------------------------------------
// Draft creation
// ---------------------------------------------------------------------------

export type CreateDraftResult = Fail<"auth" | "no_club" | "invalid" | "save">;

/** Creates a draft for the active club with the sport's defaults, then opens it. */
export async function createDraft(sportSlug: string): Promise<CreateDraftResult> {
  const sport = typeof sportSlug === "string" ? getSport(sportSlug) : undefined;
  if (!sport?.enabled) return fail("invalid");
  const { supabase, user } = await currentUser();
  if (!user) return fail("auth");

  const { data: profile } = await supabase.from("profiles").select("display_name, active_club_id").eq("id", user.id).maybeSingle();
  const clubId = profile?.active_club_id;
  if (!clubId) return fail("no_club");
  const [{ data: club }, { data: member }] = await Promise.all([
    supabase.from("clubs").select(CLUB_CONTEXT_COLUMNS).eq("id", clubId).maybeSingle(),
    supabase.from("club_members").select("role").eq("club_id", clubId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!club || !member) return fail("no_club");

  const form = defaultForm(sport, formContextOf(club, { name: profile?.display_name, email: user.email }, Date.now()));
  const { data, error } = await supabase
    .from("tournaments")
    .insert({
      club_id: club.id,
      sport_slug: sport.slug,
      name: getMessages().wizard.newName,
      created_by: user.id,
      draft_form: form as unknown as NonNullable<Json>,
      draft_step: "team",
    })
    .select("id")
    .single();
  if (error || !data) return fail("save");
  redirect(`/club/concours/${data.id}/modifier`);
}

/** Form-friendly wrapper (works without JavaScript): the sport comes from the pressed button. */
export async function startDraft(_prev: CreateDraftResult | null, formData: FormData): Promise<CreateDraftResult> {
  return createDraft(String(formData.get("sport") ?? ""));
}

// ---------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------

export type SaveDraftResult = { ok: true; savedAt: string } | Fail<"auth" | "invalid" | "not_found" | "not_draft" | "save">;

const saveSchema = z.object({ id: idSchema, form: draftSchema, step: z.enum(STEPS) });

/**
 * Saves the form as typed (possibly incomplete). Only drafts can be saved:
 * the status filter makes a published tournament read-only here. Membership
 * is enforced by RLS on the update (club members only).
 */
export async function saveDraft(id: string, form: unknown, step: string): Promise<SaveDraftResult> {
  const parsed = saveSchema.safeParse({ id, form, step });
  if (!parsed.success) return fail("invalid");
  const { supabase, user } = await currentUser();
  if (!user) return fail("auth");

  const draft: Record<string, unknown> = { ...parsed.data.form };
  // Media paths must point to this tournament's own files.
  if (draft.posterPath != null && !isMediaPathOf(id, "poster", draft.posterPath)) draft.posterPath = null;
  if (draft.rulesPdfPath != null && !isMediaPathOf(id, "rules", draft.rulesPdfPath)) draft.rulesPdfPath = null;

  const patch: TablesUpdate<"tournaments"> = { draft_form: draft as NonNullable<Json>, draft_step: parsed.data.step };
  const name = typeof draft.name === "string" ? draft.name.trim() : "";
  if (name.length >= 3 && name.length <= 140) patch.name = name;
  const sport = typeof draft.sportSlug === "string" ? getSport(draft.sportSlug) : undefined;
  if (sport?.enabled) patch.sport_slug = sport.slug;

  const { data, error } = await supabase.from("tournaments").update(patch).eq("id", id).eq("status", "draft").select("id");
  if (error) return fail("save");
  if (!data || data.length === 0) {
    const { data: row } = await supabase.from("tournaments").select("status").eq("id", id).maybeSingle();
    return fail(row && row.status !== "draft" ? "not_draft" : "not_found");
  }
  return { ok: true, savedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Summary: server validation and price
// ---------------------------------------------------------------------------

export type CheckDraftResult = { ok: true; issues: FormIssue[] } | Fail<"auth" | "invalid" | "not_found" | "not_draft">;

/** Validates the saved draft exactly like the checkout will (today's Paris date). */
export async function checkDraft(id: string): Promise<CheckDraftResult> {
  const a = await access(id);
  if (a.error) return fail(a.error);
  const res = validateForm(a.draft.tournament.draft_form, getSport, todayParis(), Date.now());
  return { ok: true, issues: res.ok ? [] : res.issues };
}

export type PricePreview = {
  planLabel: string;
  planDescription: string | null;
  baseCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  promoCode: string | null;
  promoError: PromoError | null;
};
export type PreviewPriceResult = { ok: true; price: PricePreview } | Fail<"auth" | "invalid" | "not_found" | "not_draft" | "no_plan" | "promo_limited">;

const promoSchema = z.string().max(40).nullish();

/**
 * Promo codes cannot be guessed: 10 wrong codes per account and per hour,
 * and the answer never says whether a code exists, expired or is used up.
 */
const PROMO_TRIES = 10;
const promoKey = (userId: string) => `promo:fail:${userId}`;
const promoBlocked = (userId: string) => rateLimited(promoKey(userId), PROMO_TRIES, 3600);
const promoFailed = (userId: string) => rateLimit(promoKey(userId), PROMO_TRIES, 3600);

/** Price of the saved draft (sport and maximum number of teams), promo code included. */
export async function previewPrice(id: string, promoCode?: string | null): Promise<PreviewPriceResult> {
  const promo = promoSchema.safeParse(promoCode);
  if (!promo.success) return fail("invalid");
  const a = await access(id);
  if (a.error) return fail(a.error);

  const draft = (a.draft.tournament.draft_form ?? {}) as { sportSlug?: unknown; maxTeams?: unknown };
  const sport = draftSport(typeof draft.sportSlug === "string" ? draft.sportSlug : a.draft.tournament.sport_slug);
  const maxTeams = typeof draft.maxTeams === "number" && draft.maxTeams >= 2 ? Math.min(1024, Math.floor(draft.maxTeams)) : sport.defaults.maxTeams;
  const code = normalizePromoCode(promo.data) || null;
  if (code && (await promoBlocked(a.userId))) return fail("promo_limited");
  const q = await quoteFor({ sportSlug: sport.slug, maxTeams, promoCode: code });
  if (!q) return fail("no_plan");
  if (code && q.promoError) await promoFailed(a.userId);
  return {
    ok: true,
    price: {
      planLabel: q.plan.label,
      planDescription: q.plan.description,
      baseCents: q.baseCents,
      discountCents: q.discountCents,
      totalCents: q.totalCents,
      currency: q.currency,
      promoCode: q.promo?.code ?? null,
      promoError: q.promoError ? "unknown" : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

export type PayDraftResult = Fail<CheckoutError | "auth" | "invalid"> & { issues?: FormIssue[] };

/**
 * Starts the payment (or publishes right away when the total is 0 €). The
 * checkout re-validates the saved draft and computes the price itself; the
 * tournament is published only by the payment confirmation, never here.
 */
export async function payDraft(id: string, promoCode?: string | null): Promise<PayDraftResult> {
  const promo = promoSchema.safeParse(promoCode);
  if (!promo.success) return fail("invalid");
  // Club membership and draft status are checked here too, not only by the checkout.
  const a = await access(id);
  if (a.error) return fail(a.error);

  const code = normalizePromoCode(promo.data) || null;
  if (code && (await promoBlocked(a.userId))) return fail("promo_invalid");
  let result: CheckoutResult;
  try {
    result = await startCheckout({ tournamentId: id, userId: a.userId, promoCode: code });
  } catch (e) {
    console.error("payDraft: startCheckout failed", e);
    return fail("provider_error");
  }
  if (result.kind === "redirect") redirect(result.url);
  if (result.kind === "published") redirect(`/club/concours/${id}/paiement`);
  if (result.error === "promo_invalid" && code) await promoFailed(a.userId);
  return { ok: false, error: result.error, issues: result.issues };
}

// ---------------------------------------------------------------------------
// Poster and rules PDF
// ---------------------------------------------------------------------------
// Files go straight from the browser to storage through a one-time signed
// upload URL (server action bodies are limited to 1 MB). The server picks the
// path, then checks the stored file (size, real type) before accepting it.

type MediaError = "auth" | "invalid" | "not_found" | "not_draft" | "too_big" | "bad_type" | "upload";
export type PrepareUploadResult = { ok: true; path: string; token: string } | Fail<MediaError>;
export type ConfirmUploadResult = { ok: true; path: string } | Fail<MediaError>;
export type RemoveMediaResult = { ok: true } | Fail<MediaError>;

const fileMetaSchema = z.object({ type: z.string().max(100), size: z.number().int().min(1) });

export async function prepareUpload(id: string, kind: MediaKind, file: { type: string; size: number }): Promise<PrepareUploadResult> {
  const k = kindSchema.safeParse(kind);
  const meta = fileMetaSchema.safeParse(file);
  if (!k.success || !meta.success) return fail("invalid");
  const problem = checkMediaFile(k.data, meta.data);
  if (problem) return fail(problem);
  const a = await access(id);
  if (a.error) return fail(a.error);

  const path = mediaPath(id, k.data, meta.data.type, Date.now());
  const { data, error } = await createAdminClient().storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return fail("upload");
  return { ok: true, path, token: data.token };
}

/** Removes a file unless a checkout in progress still points to it. */
async function removeIfUnused(tournamentId: string, path: string) {
  const admin = createAdminClient();
  const { data: pending } = await admin.from("payments").select("form_snapshot").eq("tournament_id", tournamentId).eq("status", "pending");
  const used = (pending ?? []).some((p) => {
    const snap = p.form_snapshot as { posterPath?: unknown; rulesPdfPath?: unknown } | null;
    return snap?.posterPath === path || snap?.rulesPdfPath === path;
  });
  if (!used) await admin.storage.from(MEDIA_BUCKET).remove([path]);
}

export async function confirmUpload(id: string, kind: MediaKind, path: string, previous?: string | null): Promise<ConfirmUploadResult> {
  const k = kindSchema.safeParse(kind);
  if (!k.success || !isMediaPathOf(id, k.data, path)) return fail("invalid");
  const a = await access(id);
  if (a.error) return fail(a.error);

  const admin = createAdminClient();
  const bucket = admin.storage.from(MEDIA_BUCKET);
  const { data: blob, error } = await bucket.download(path);
  if (error || !blob) return fail("upload");
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const problem = blob.size > MEDIA_RULES[k.data].maxBytes ? "too_big" : sniffType(head) !== typeOfPath(path) ? "bad_type" : null;
  if (problem) {
    await bucket.remove([path]);
    return fail(problem);
  }
  if (previous && previous !== path && isMediaPathOf(id, k.data, previous)) await removeIfUnused(id, previous);
  return { ok: true, path };
}

export async function removeMedia(id: string, kind: MediaKind, path: string): Promise<RemoveMediaResult> {
  const k = kindSchema.safeParse(kind);
  if (!k.success || !isMediaPathOf(id, k.data, path)) return fail("invalid");
  const a = await access(id);
  if (a.error) return fail(a.error);
  await removeIfUnused(id, path);
  return { ok: true };
}
