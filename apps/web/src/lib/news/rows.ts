import type { FeedEntry } from "./rss";

/** News older than this are removed (the feed only shows recent ones). */
export const NEWS_RETENTION_DAYS = 60;
export const DAY = 24 * 60 * 60 * 1000;

/** Rows to store for a feed: no date in the future, nothing older than the retention window. */
export function toNewsRows(sourceId: string, entries: FeedEntry[], nowMs: number) {
  const cutoff = nowMs - NEWS_RETENTION_DAYS * DAY;
  return entries.flatMap((e) => {
    const ms = e.publishedAt ? Date.parse(e.publishedAt) : null;
    if (ms != null && ms < cutoff) return [];
    const published = ms == null ? null : new Date(Math.min(ms, nowMs)).toISOString();
    return [{ source_id: sourceId, title: e.title, url: e.url, published_at: published }];
  });
}
