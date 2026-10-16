import type { NextRequest } from "next/server";
import { dispatchQueued, queueScheduledNotifications } from "@/lib/notifications/server";
import { closeExpiredTournaments } from "@/lib/tournament/auto-close";
import { processDueDraws } from "@/lib/tournament/auto-draw";
import { json } from "@/lib/tournament/http";

/**
 * Called every minute by a scheduler (Supabase pg_cron, cron-job.org…):
 * runs the automatic draws whose time has come, queues the scheduled
 * notifications (reminders), sends what is waiting (retries included) and
 * closes for good the tournaments finished more than 24 h ago.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: { code: "UNAUTHORIZED" } }, 401);
  const drawn = await processDueDraws();
  const queued = await queueScheduledNotifications();
  const notifications = await dispatchQueued();
  const closed = await closeExpiredTournaments();
  return json({ drawn, queued, notifications, closed });
}
