import type { NextRequest } from "next/server";
import { processDueDraws } from "@/lib/tournament/auto-draw";
import { json } from "@/lib/tournament/http";

/**
 * Called every minute by a scheduler (Supabase pg_cron, cron-job.org…):
 * runs the automatic draws whose time has come.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: { code: "UNAUTHORIZED" } }, 401);
  const drawn = await processDueDraws();
  return json({ drawn });
}
