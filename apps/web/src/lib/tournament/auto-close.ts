import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeCommand } from "./execute";

/** Corrections stay possible this long after the final, then the link is closed for good. */
export const AUTO_CLOSE_AFTER_MS = 24 * 3600_000;

/** Stable operation id per tournament: two ticks at the same time close it once. */
export function closeOpId(tournamentId: string): string {
  const h = createHash("sha256").update(`tournament.close:${tournamentId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Closes (finished -> archived) the tournaments whose final was played more
 * than 24 h ago and that the organizer has not closed by hand. Called by
 * /api/cron/tick.
 */
export async function closeExpiredTournaments(now = Date.now()): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("tournaments")
    .select("id, short_code")
    .eq("status", "finished")
    .not("finished_at", "is", null)
    .lte("finished_at", new Date(now - AUTO_CLOSE_AFTER_MS).toISOString())
    .order("finished_at")
    .limit(20);
  const closed: string[] = [];
  for (const t of data ?? []) {
    if (!t.short_code) continue;
    const res = await executeCommand({
      code: t.short_code,
      clientOpId: closeOpId(t.id),
      command: { type: "tournament.close" },
      actor: null,
      source: "system",
    });
    if (res.ok) closed.push(t.short_code);
  }
  return closed;
}
