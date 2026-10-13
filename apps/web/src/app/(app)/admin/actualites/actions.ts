"use server";
import { refresh, revalidateTag } from "next/cache";
import { z } from "zod";
import { SPORTS } from "@orgasport/sports";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { feedUrlOrNull } from "@/lib/news/download";
import { checkFeed, refreshNewsSources } from "@/lib/news/fetch";

/**
 * Server actions of the news sources admin page. Public POST endpoints: each
 * one checks again that the caller is a platform admin (RLS on news_sources
 * enforces the same rule in the database). Error codes map to
 * `getMessages().feed.admin.errors`.
 */

export type NewsField = "name" | "feedUrl" | "siteUrl" | "sport";
const FIELDS: NewsField[] = ["name", "feedUrl", "siteUrl", "sport"];

export type SourceFormState =
  | { ok: true; input: Record<NewsField, string> & { enabled: string } }
  | { ok: false; error: string; fields?: Partial<Record<NewsField, string>>; input?: Record<NewsField, string> & { enabled: string } }
  | null;
export type TestState = { ok: true; found: number; sample: string | null } | { ok: false; error: string; status?: number } | null;
export type RefreshState = { ok: true; sources: number; saved: number; failed: number } | { ok: false; error: string } | null;

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = "23505";

async function isPlatformAdmin(): Promise<boolean> {
  const viewer = await getViewer();
  return Boolean(viewer?.isAdmin);
}

const isHttpUrl = (v: string) => /^https?:\/\//i.test(v) && URL.canParse(v);

const sourceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  feedUrl: z.string().trim().max(500).refine((v) => feedUrlOrNull(v) != null),
  siteUrl: z.string().trim().max(500).refine((v) => v === "" || isHttpUrl(v)),
  sport: z.string().refine((v) => v === "" || SPORTS.some((s) => s.slug === v)),
});

const FIELD_ERROR: Record<NewsField, string> = { name: "name", feedUrl: "url", siteUrl: "url", sport: "sport" };

function postedId(data: FormData): string | null {
  const raw = data.get("id");
  if (raw === null || raw === "") return "";
  return typeof raw === "string" && ID_RE.test(raw) ? raw : null;
}

function afterChange() {
  revalidateTag("news", "max");
  refresh();
}

export async function saveNewsSource(_prev: SourceFormState, data: FormData): Promise<SourceFormState> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "forbidden" };
  const id = postedId(data);
  if (id === null) return { ok: false, error: "notFound" };
  const input = {
    ...(Object.fromEntries(FIELDS.map((f) => [f, String(data.get(f) ?? "")])) as Record<NewsField, string>),
    enabled: data.get("enabled") === "on" ? "on" : "",
  };
  const parsed = sourceSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Partial<Record<NewsField, string>> = {};
    for (const issue of parsed.error.issues) {
      const f = issue.path[0] as NewsField;
      fields[f] ??= FIELD_ERROR[f];
    }
    return { ok: false, error: "form", fields, input };
  }

  const row = {
    name: parsed.data.name,
    feed_url: feedUrlOrNull(parsed.data.feedUrl)!.toString(),
    site_url: parsed.data.siteUrl || null,
    sport_slug: parsed.data.sport || null,
    enabled: input.enabled === "on",
  };
  const supabase = await createClient();
  const res = id
    ? await supabase.from("news_sources").update(row).eq("id", id).select("id")
    : await supabase.from("news_sources").insert(row).select("id");
  if (res.error) return { ok: false, error: res.error.code === UNIQUE_VIOLATION ? "urlTaken" : "server", input };
  if (!res.data?.length) return { ok: false, error: "notFound", input };
  afterChange();
  return { ok: true, input };
}

/** « Activer » / « Désactiver » (plain form, works without JavaScript). */
export async function toggleNewsSource(data: FormData): Promise<void> {
  if (!(await isPlatformAdmin())) return;
  const id = postedId(data);
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("news_sources").update({ enabled: data.get("enabled") === "true" }).eq("id", id);
  afterChange();
}

/** Deletes a source and (by cascade) its news items. */
export async function deleteNewsSource(data: FormData): Promise<void> {
  if (!(await isPlatformAdmin())) return;
  const id = postedId(data);
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("news_sources").delete().eq("id", id);
  afterChange();
}

/** « Tester » : downloads the saved feed and counts its items, without saving anything. */
export async function testNewsSource(_prev: TestState, data: FormData): Promise<TestState> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "forbidden" };
  const id = postedId(data);
  if (!id) return { ok: false, error: "notFound" };
  const supabase = await createClient();
  const { data: source } = await supabase.from("news_sources").select("feed_url").eq("id", id).maybeSingle();
  if (!source) return { ok: false, error: "notFound" };
  const check = await checkFeed(source.feed_url);
  if (!check.ok) return { ok: false, error: check.error, status: check.status };
  return { ok: true, found: check.entries.length, sample: check.entries[0]?.title ?? null };
}

/** Fetches every enabled source now (same job as the hourly cron). */
export async function refreshNews(): Promise<RefreshState> {
  if (!(await isPlatformAdmin())) return { ok: false, error: "forbidden" };
  try {
    const { sources } = await refreshNewsSources();
    afterChange();
    return {
      ok: true,
      sources: sources.length,
      saved: sources.reduce((n, s) => n + s.saved, 0),
      failed: sources.filter((s) => !s.ok).length,
    };
  } catch {
    return { ok: false, error: "server" };
  }
}
