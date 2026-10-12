import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePromoCode, pickPlan, quote, type PlanRow, type PromoRow, type Quote } from "./quote";

/**
 * Server-side price computation. Promo codes are not readable by clubs
 * (RLS), so they are looked up with the service role, here only.
 */
export async function quoteFor(input: { sportSlug: string; maxTeams: number; promoCode?: string | null }): Promise<Quote | null> {
  const admin = createAdminClient();
  const code = normalizePromoCode(input.promoCode);
  const [plansRes, promoRes] = await Promise.all([
    admin.from("pricing_plans").select("id, code, label, description, price_cents, currency, sport_slug, max_teams, active, sort_order").eq("active", true),
    code
      ? admin
          .from("promo_codes")
          .select("id, code, percent_off, amount_off_cents, max_redemptions, redemptions, valid_until, active")
          .eq("code", code)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (plansRes.error) throw plansRes.error;
  const plan = pickPlan((plansRes.data ?? []) as PlanRow[], input.sportSlug, input.maxTeams);
  if (!plan) return null;
  return quote(plan, (promoRes.data as PromoRow | null) ?? null, Boolean(code), Date.now());
}
