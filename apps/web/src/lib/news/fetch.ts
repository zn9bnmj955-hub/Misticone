import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadFeed, type DownloadError } from "./download";
import { parseFeed, type FeedEntry } from "./rss";
import { DAY, NEWS_RETENTION_DAYS, toNewsRows } from "./rows";

const CONCURRENCY = 4;

export type FeedCheck = { ok: true; entries: FeedEntry[] } | { ok: false; error: DownloadError | "parse"; status?: number };

/** Downloads and parses one feed (used by the cron and by the admin « Tester » button). */
export async function checkFeed(feedUrl: string, fetchImpl?: typeof fetch): Promise<FeedCheck> {
  const res = await downloadFeed(feedUrl, { fetchImpl });
  if (!res.ok) return res;
  try {
    return { ok: true, entries: parseFeed(res.text, res.url) };
  } catch {
    return { ok: false, error: "parse" };
  }
}

export type SourceReport = { id: string; name: string; ok: boolean; found: number; saved: number; error?: string };
export type NewsRefresh = { sources: SourceReport[]; deleted: number };

/**
 * Fetches every enabled source, upserts its items by URL (title, link and
 * date only), stamps `last_fetched_at` on success, then deletes the items
 * older than 60 days. One failing source never stops the others.
 */
export async function refreshNewsSources(opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<NewsRefresh> {
  const db = createAdminClient();
  const nowMs = (opts.now ?? new Date()).getTime();
  const { data: sources, error } = await db.from("news_sources").select("id, name, feed_url").eq("enabled", true);
  if (error) throw error;

  const reports: SourceReport[] = [];
  const queue = [...(sources ?? [])];
  async function worker() {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const check = await checkFeed(s.feed_url, opts.fetchImpl);
      if (!check.ok) {
        reports.push({ id: s.id, name: s.name, ok: false, found: 0, saved: 0, error: check.error });
        continue;
      }
      const rows = toNewsRows(s.id, check.entries, nowMs);
      let saved = 0;
      if (rows.length > 0) {
        const up = await db.from("news_items").upsert(rows, { onConflict: "url" }).select("id");
        if (up.error) {
          reports.push({ id: s.id, name: s.name, ok: false, found: check.entries.length, saved: 0, error: "server" });
          continue;
        }
        saved = up.data?.length ?? 0;
      }
      await db.from("news_sources").update({ last_fetched_at: new Date(nowMs).toISOString() }).eq("id", s.id);
      reports.push({ id: s.id, name: s.name, ok: true, found: check.entries.length, saved });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  const cutoff = new Date(nowMs - NEWS_RETENTION_DAYS * DAY).toISOString();
  const del = await db
    .from("news_items")
    .delete({ count: "exact" })
    .or(`published_at.lt.${cutoff},and(published_at.is.null,created_at.lt.${cutoff})`);
  return { sources: reports, deleted: del.count ?? 0 };
}
