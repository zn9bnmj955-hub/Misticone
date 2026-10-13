"use server";
import { refresh, updateTag } from "next/cache";
import { SPORTS } from "@orgasport/sports";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import {
  ID_RE,
  KB_FIELDS,
  SETTINGS_FIELDS,
  formFields,
  mergePricing,
  parseKbForm,
  parseSearchForm,
  parseSettingsForm,
  type FieldErrors,
  type KbField,
  type SettingsField,
} from "@/components/admin/assistant/forms";

/**
 * Server actions of /admin/assistant. Public POST endpoints: each one checks
 * again that the caller is a platform admin (RLS on app_settings and
 * kb_documents enforces the same rule in the database). Error codes map to
 * `getMessages().adminAssistant.errors`.
 */

/** `input` echoes what was typed: React resets a form after its action. */
export type AssistantFormState<F extends string> =
  | { ok: true; input: Record<F, string> & { checked: string } }
  | { ok: false; error: string; fields?: FieldErrors<F>; input?: Record<F, string> & { checked: string } }
  | null;

export type KbSearchHit = { title: string; sport: string | null; sourceUrl: string | null; content: string; rank: number };
export type KbSearchState = { ok: true; query: string; hits: KbSearchHit[] } | { ok: false; error: string; query?: string } | null;

async function isPlatformAdmin(): Promise<boolean> {
  const viewer = await getViewer();
  return Boolean(viewer?.isAdmin);
}

const sportSlugs = () => SPORTS.map((s) => s.slug);

/** "" for a creation, a uuid for an update, null when the posted id is garbage. */
function postedId(data: FormData): string | null {
  const raw = data.get("id");
  if (raw === null || raw === "") return "";
  return typeof raw === "string" && ID_RE.test(raw) ? raw : null;
}

export async function saveAiSettings(
  _prev: AssistantFormState<SettingsField>,
  data: FormData,
): Promise<AssistantFormState<SettingsField>> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "forbidden" };
  const enabled = data.get("enabled") === "on";
  const input = { ...formFields(data, SETTINGS_FIELDS), checked: enabled ? "on" : "" };
  const parsed = parseSettingsForm(input, enabled);
  if (!parsed.ok) return { ok: false, error: "form", fields: parsed.errors, input };
  const v = parsed.value;

  const supabase = await createClient();
  const { data: pricingRow, error: readError } = await supabase.from("app_settings").select("value").eq("key", "ai.pricing").maybeSingle();
  if (readError) {
    console.error("[admin] saveAiSettings", readError.message);
    return { ok: false, error: "server", input };
  }
  // The override belongs to the model that actually answers (the environment wins).
  const priceModel = process.env.ANTHROPIC_MODEL || v.model;
  const rows = [
    { key: "ai.enabled", value: v.enabled },
    { key: "ai.model", value: v.model },
    { key: "ai.daily_quota", value: v.dailyQuota },
    { key: "ai.monthly_budget_eur", value: v.monthlyBudgetEur },
    { key: "ai.usd_to_eur", value: v.usdToEur },
    { key: "ai.pricing", value: mergePricing(pricingRow?.value, priceModel, v.price) },
  ];
  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) {
    console.error("[admin] saveAiSettings", error.message);
    return { ok: false, error: "server", input };
  }
  // getAiSettings() is cached with this tag: the next question uses the new values.
  updateTag("settings");
  refresh();
  return { ok: true, input };
}

export async function saveKbDocument(_prev: AssistantFormState<KbField>, data: FormData): Promise<AssistantFormState<KbField>> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "forbidden" };
  const id = postedId(data);
  if (id === null) return { ok: false, error: "notFound" };
  const published = data.get("published") === "on";
  const input = { ...formFields(data, KB_FIELDS), checked: published ? "on" : "" };
  const parsed = parseKbForm(input, published, sportSlugs());
  if (!parsed.ok) return { ok: false, error: "form", fields: parsed.errors, input };

  // The kb_rechunk trigger cuts the body into paragraphs (kb_chunks).
  const supabase = await createClient();
  const res = id
    ? await supabase.from("kb_documents").update(parsed.value).eq("id", id).select("id")
    : await supabase.from("kb_documents").insert(parsed.value).select("id");
  if (res.error) {
    console.error("[admin] saveKbDocument", res.error.message);
    return { ok: false, error: "server", input };
  }
  if (res.data.length === 0) return { ok: false, error: "notFound", input };
  refresh();
  return { ok: true, input };
}

/** « Publier » / « Dépublier » (plain form, works without JavaScript). */
export async function setKbPublished(data: FormData): Promise<void> {
  if (!(await isPlatformAdmin())) return;
  const id = postedId(data);
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("kb_documents")
    .update({ published: data.get("published") === "true" })
    .eq("id", id);
  if (error) console.error("[admin] setKbPublished", error.message);
  refresh();
}

/** Deletes a document and (by cascade) its paragraphs. */
export async function deleteKbDocument(data: FormData): Promise<void> {
  if (!(await isPlatformAdmin())) return;
  const id = postedId(data);
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase.from("kb_documents").delete().eq("id", id);
  if (error) console.error("[admin] deleteKbDocument", error.message);
  refresh();
}

/** « Tester une question » : the paragraphs the assistant's knowledge_search tool would get. */
export async function testKbSearch(_prev: KbSearchState, data: FormData): Promise<KbSearchState> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "forbidden" };
  const rawQuery = String(data.get("query") ?? "");
  const parsed = parseSearchForm(rawQuery, String(data.get("sport") ?? ""), sportSlugs());
  if (!parsed) return { ok: false, error: "query", query: rawQuery };
  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("kb_search", {
    p_query: parsed.query,
    ...(parsed.sport ? { p_sport: parsed.sport } : {}),
    p_limit: 5,
  });
  if (error) {
    console.error("[admin] testKbSearch", error.message);
    return { ok: false, error: "server", query: parsed.query };
  }
  return {
    ok: true,
    query: parsed.query,
    hits: (rows ?? []).map((r) => ({
      title: r.title,
      sport: r.sport_slug ?? null,
      sourceUrl: r.source_url ?? null,
      content: r.content,
      rank: Number(r.rank) || 0,
    })),
  };
}
