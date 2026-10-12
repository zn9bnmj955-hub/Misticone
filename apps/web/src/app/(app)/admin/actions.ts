"use server";
import { refresh } from "next/cache";
import { SPORTS } from "@orgasport/sports";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import {
  ID_RE,
  PLAN_FIELDS,
  PROMO_FIELDS,
  formFields,
  parsePlanForm,
  parsePromoForm,
  type FieldErrors,
  type PlanField,
  type PromoField,
} from "@/components/admin/forms";

/**
 * Server actions of the platform administration. They are public POST
 * endpoints: each one checks again that the caller is a platform admin
 * (RLS on pricing_plans and promo_codes enforces the same rule in the
 * database). Error codes map to `getMessages().admin.errors`.
 */

export type AdminError = "forbidden" | "notFound" | "server" | "codeTaken" | "form";
/**
 * `input` echoes what was typed: React resets a form after its action, so an
 * edit form (or a form with an error) shows these values again instead of
 * losing them.
 */
export type AdminFormState<F extends string> =
  | { ok: true; input: Record<F, string> }
  | { ok: false; error: AdminError; fields?: FieldErrors<F>; input?: Record<F, string> }
  | null;

async function isPlatformAdmin(): Promise<boolean> {
  const viewer = await getViewer();
  return Boolean(viewer?.isAdmin);
}

/** "" for a creation, a uuid for an update, null when the posted id is garbage. */
function postedId(data: FormData): string | null {
  const raw = data.get("id");
  if (raw === null || raw === "") return "";
  return typeof raw === "string" && ID_RE.test(raw) ? raw : null;
}

const UNIQUE_VIOLATION = "23505";

export async function savePlan(_prev: AdminFormState<PlanField>, data: FormData): Promise<AdminFormState<PlanField>> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "forbidden" };
  const id = postedId(data);
  if (id === null) return { ok: false, error: "notFound" };
  const input = formFields(data, PLAN_FIELDS);
  // Any configured sport is accepted (a plan may target a sport that is not open yet).
  const parsed = parsePlanForm(input, SPORTS.map((s) => s.slug));
  if (!parsed.ok) return { ok: false, error: "form", fields: parsed.errors, input };

  const supabase = await createClient();
  const res = id
    ? await supabase.from("pricing_plans").update(parsed.value).eq("id", id).select("id")
    : await supabase.from("pricing_plans").insert({ ...parsed.value, currency: "eur" }).select("id");
  if (res.error) {
    if (res.error.code === UNIQUE_VIOLATION) return { ok: false, error: "codeTaken", fields: { code: "codeTaken" }, input };
    console.error("[admin] savePlan", res.error.message);
    return { ok: false, error: "server", input };
  }
  if (res.data.length === 0) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true, input };
}

export async function savePromo(_prev: AdminFormState<PromoField>, data: FormData): Promise<AdminFormState<PromoField>> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "forbidden" };
  const id = postedId(data);
  if (id === null) return { ok: false, error: "notFound" };
  const input = formFields(data, PROMO_FIELDS);
  const parsed = parsePromoForm(input, id === "");
  if (!parsed.ok) return { ok: false, error: "form", fields: parsed.errors, input };

  const { code, ...values } = parsed.value;
  const supabase = await createClient();
  const res = id
    ? await supabase.from("promo_codes").update(values).eq("id", id).select("id")
    : await supabase.from("promo_codes").insert({ ...values, code: code ?? "" }).select("id");
  if (res.error) {
    if (res.error.code === UNIQUE_VIOLATION) return { ok: false, error: "codeTaken", fields: { code: "codeTaken" }, input };
    console.error("[admin] savePromo", res.error.message);
    return { ok: false, error: "server", input };
  }
  if (res.data.length === 0) return { ok: false, error: "notFound" };
  refresh();
  return { ok: true, input };
}

/** One-click deactivate / reactivate from the list (works without JavaScript). */
export async function setPromoActive(data: FormData): Promise<void> {
  if (!(await isPlatformAdmin())) return;
  const id = postedId(data);
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("promo_codes")
    .update({ active: data.get("active") === "true" })
    .eq("id", id);
  if (error) console.error("[admin] setPromoActive", error.message);
  refresh();
}
