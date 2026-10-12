import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Viewer } from "@/lib/viewer";
import type { AiSettings, Tier } from "./settings";

/**
 * Quotas: questions per day (guests < accounts < clubs that paid for a
 * tournament link) and a global monthly spending cap. Counted per account,
 * or per device (hashed random id in a cookie) for guests.
 */
export function deviceHash(deviceId: string): string {
  return createHash("sha256").update(`ai:${deviceId}`).digest("hex");
}

export async function resolveTier(viewer: Viewer | null): Promise<Tier> {
  if (!viewer) return "guest";
  if (viewer.clubs.length === 0) return "account";
  const { count } = await createAdminClient()
    .from("payments")
    .select("id", { count: "exact", head: true })
    .in("club_id", viewer.clubs.map((c) => c.id))
    .eq("status", "paid")
    .neq("provider", "free");
  return (count ?? 0) > 0 ? "paying_club" : "account";
}

export type QuotaState =
  | { ok: true; used: number; limit: number; tier: Tier }
  | { ok: false; reason: "daily" | "budget" | "disabled"; used: number; limit: number; tier: Tier };

export async function checkQuota(who: { userId: string | null; deviceHash: string }, tier: Tier, settings: AiSettings): Promise<QuotaState> {
  const limit = settings.dailyQuota[tier];
  if (!settings.enabled) return { ok: false, reason: "disabled", used: 0, limit, tier };
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  let q = admin.from("ai_usage").select("questions").eq("day", today);
  q = who.userId ? q.eq("user_id", who.userId) : q.eq("device_hash", who.deviceHash);
  const [{ data: row }, { data: monthCost }] = await Promise.all([q.maybeSingle(), admin.rpc("ai_month_cost_micro")]);
  const used = row?.questions ?? 0;
  if (Number(monthCost ?? 0) >= settings.monthlyBudgetEur * 1_000_000) return { ok: false, reason: "budget", used, limit, tier };
  if (used >= limit) return { ok: false, reason: "daily", used, limit, tier };
  return { ok: true, used, limit, tier };
}

export async function recordUsage(
  who: { userId: string | null; deviceHash: string },
  usage: { input: number; output: number; costMicroEur: number },
): Promise<void> {
  const { error } = await createAdminClient().rpc("ai_usage_add", {
    p_user: who.userId as string,
    p_device: who.userId ? (null as unknown as string) : who.deviceHash,
    p_input: usage.input,
    p_output: usage.output,
    p_cost: usage.costMicroEur,
  });
  if (error) console.error("ai usage not recorded", error.message);
}
