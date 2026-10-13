import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { refreshNewsSources } from "@/lib/news/fetch";
import { json } from "@/lib/tournament/http";

/**
 * Called every hour by a scheduler (Supabase pg_cron, cron-job.org…): reads
 * the enabled RSS/Atom sources, stores title + link + date of their items and
 * removes the news older than 60 days.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: { code: "UNAUTHORIZED" } }, 401);
  const result = await refreshNewsSources();
  revalidateTag("news", "max");
  return json(result);
}
