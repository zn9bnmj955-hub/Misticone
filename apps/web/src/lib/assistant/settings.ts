import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_PRICES, type ModelPrice } from "./pricing";

/**
 * Assistant settings, edited by the platform admin (app_settings, keys
 * "ai.*"). Defaults apply when a key is missing. ANTHROPIC_MODEL (env) wins
 * over the database for the model, so a deployment can pin it.
 */
export type Tier = "guest" | "account" | "paying_club";

export type AiSettings = {
  enabled: boolean;
  model: string;
  dailyQuota: Record<Tier, number>;
  monthlyBudgetEur: number;
  usdToEur: number;
  price: ModelPrice;
};

export const DEFAULT_MODEL = "claude-haiku-5-5";

const DEFAULTS = {
  enabled: true,
  dailyQuota: { guest: 5, account: 20, paying_club: 100 } as Record<Tier, number>,
  monthlyBudgetEur: 20,
  usdToEur: 0.92,
};

async function readSettings(): Promise<Record<string, unknown>> {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings");
  const { data } = await createAdminClient().from("app_settings").select("key, value").like("key", "ai.%");
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback);

export async function getAiSettings(): Promise<AiSettings> {
  const s = await readSettings();
  const model = process.env.ANTHROPIC_MODEL || (typeof s["ai.model"] === "string" && s["ai.model"]) || DEFAULT_MODEL;
  const quota = (s["ai.daily_quota"] ?? {}) as Partial<Record<Tier, unknown>>;
  const pricing = (s["ai.pricing"] ?? {}) as Record<string, Partial<ModelPrice>>;
  const base = DEFAULT_PRICES[model] ?? DEFAULT_PRICES[DEFAULT_MODEL]!;
  const override = pricing[model] ?? {};
  return {
    enabled: s["ai.enabled"] !== false,
    model,
    dailyQuota: {
      guest: num(quota.guest, DEFAULTS.dailyQuota.guest),
      account: num(quota.account, DEFAULTS.dailyQuota.account),
      paying_club: num(quota.paying_club, DEFAULTS.dailyQuota.paying_club),
    },
    monthlyBudgetEur: num(s["ai.monthly_budget_eur"], DEFAULTS.monthlyBudgetEur),
    usdToEur: num(s["ai.usd_to_eur"], DEFAULTS.usdToEur),
    price: {
      inputUsdPerMTok: num(override.inputUsdPerMTok, base.inputUsdPerMTok),
      outputUsdPerMTok: num(override.outputUsdPerMTok, base.outputUsdPerMTok),
      cacheReadUsdPerMTok: num(override.cacheReadUsdPerMTok, base.cacheReadUsdPerMTok ?? base.inputUsdPerMTok * 0.1),
    },
  };
}

export function assistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
