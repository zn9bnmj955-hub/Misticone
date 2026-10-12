import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeCommand } from "./execute";

/**
 * Tournaments whose automatic first draw time has passed and that have not
 * been drawn yet. Called by /api/cron/tick (every minute in production) and,
 * as a safety net, after a public tournament page is served.
 */
export async function processDueDraws(onlyCode?: string): Promise<string[]> {
  const admin = createAdminClient();
  let query = admin
    .from("tournaments")
    .select("id, short_code, config")
    .in("status", ["published", "registration_closed", "check_in"])
    .not("config->>autoDrawAt", "is", null)
    .lte("config->>autoDrawAt", new Date().toISOString())
    .limit(20);
  if (onlyCode) query = query.eq("short_code", onlyCode);
  const { data } = await query;
  const drawn: string[] = [];
  for (const t of data ?? []) {
    const { count } = await admin.from("rounds").select("id", { count: "exact", head: true }).eq("tournament_id", t.id);
    if ((count ?? 0) > 0 || !t.short_code) continue;
    const res = await executeCommand({
      code: t.short_code,
      // Stable operation id: two ticks at the same time apply the draw once.
      clientOpId: autoDrawOpId(t.id),
      command: { type: "round.draw", bracket: "main", seed: `auto-${t.id}` },
      actor: null,
      source: "system",
    });
    if (res.ok) drawn.push(t.short_code);
  }
  return drawn;
}

function autoDrawOpId(tournamentId: string): string {
  // Turn the tournament id into a different, stable UUID.
  const hex = tournamentId.replace(/-/g, "");
  const flipped = [...hex].map((c) => (15 - parseInt(c, 16)).toString(16)).join("");
  const v = `${flipped.slice(0, 12)}4${flipped.slice(13, 16)}a${flipped.slice(17, 32)}`;
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
}
