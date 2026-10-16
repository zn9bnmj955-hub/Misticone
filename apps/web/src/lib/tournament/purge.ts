import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Runs the SQL purge (idempotent, service role): personal data of the tournaments
 * closed more than 14 days ago is deleted, the row and its short code are kept.
 * Called by /api/cron/tick (local and safety net) and by pg_cron once a day in
 * production. Returns the short codes purged by this run.
 */
export async function purgeExpiredTournaments(now = Date.now()): Promise<string[]> {
  const { data, error } = await createAdminClient().rpc("purge_finished_tournaments", { p_now: new Date(now).toISOString() });
  if (error) throw error;
  return (data ?? []).filter((c): c is string => typeof c === "string");
}
