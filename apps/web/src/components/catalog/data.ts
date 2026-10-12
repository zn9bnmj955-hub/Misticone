import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Waiting-list setting of full tournaments (not returned by
 * catalog_tournaments): tells « Complet » from « Complet · liste d'attente »
 * and whether the card offers the registration shortcut.
 */
export async function waitlistFlags(ids: string[]): Promise<Record<string, boolean>> {
  "use cache";
  cacheLife("minutes");
  cacheTag("tournaments");
  if (ids.length === 0) return {};
  const { data, error } = await createPublicClient().from("tournaments").select("id, waitlist_enabled").in("id", ids);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.id, r.waitlist_enabled]));
}
