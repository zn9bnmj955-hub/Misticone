/**
 * Price of a tournament link. Prices live in the database (pricing_plans,
 * edited in the admin) and promo codes in promo_codes: nothing is hard-coded.
 * Pure functions, shared by the summary screen and the checkout.
 */

export type PlanRow = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  price_cents: number;
  currency: string;
  sport_slug: string | null;
  max_teams: number | null;
  active: boolean;
  sort_order: number;
};

export type PromoRow = {
  id: string;
  code: string;
  percent_off: number | null;
  amount_off_cents: number | null;
  max_redemptions: number | null;
  redemptions: number;
  valid_until: string | null;
  active: boolean;
};

export type PromoError = "unknown" | "expired" | "exhausted";

export type Quote = {
  plan: PlanRow;
  baseCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
  promo: { id: string; code: string } | null;
  promoError: PromoError | null;
};

export function normalizePromoCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * The plan that applies: active, for this sport or for all sports, and big
 * enough for the maximum number of teams. Sport-specific plans win, then the
 * smallest team limit, then the admin's order.
 */
export function pickPlan(plans: PlanRow[], sportSlug: string, maxTeams: number): PlanRow | null {
  const fits = plans.filter(
    (p) => p.active && (p.sport_slug === null || p.sport_slug === sportSlug) && (p.max_teams === null || p.max_teams >= maxTeams),
  );
  fits.sort(
    (a, b) =>
      Number(b.sport_slug !== null) - Number(a.sport_slug !== null) ||
      (a.max_teams ?? Infinity) - (b.max_teams ?? Infinity) ||
      a.sort_order - b.sort_order ||
      a.price_cents - b.price_cents,
  );
  return fits[0] ?? null;
}

export function checkPromo(promo: PromoRow | null, nowMs: number): PromoError | null {
  if (!promo || !promo.active) return "unknown";
  if (promo.valid_until && new Date(promo.valid_until).getTime() < nowMs) return "expired";
  if (promo.max_redemptions !== null && promo.redemptions >= promo.max_redemptions) return "exhausted";
  return null;
}

export function quote(plan: PlanRow, promo: PromoRow | null, promoRequested: boolean, nowMs: number): Quote {
  const base = plan.price_cents;
  const error = promoRequested ? checkPromo(promo, nowMs) : null;
  const valid = promoRequested && !error && promo ? promo : null;
  let discount = 0;
  if (valid?.percent_off) discount = Math.round((base * valid.percent_off) / 100);
  else if (valid?.amount_off_cents) discount = valid.amount_off_cents;
  discount = Math.min(base, Math.max(0, discount));
  return {
    plan,
    baseCents: base,
    discountCents: discount,
    totalCents: base - discount,
    currency: plan.currency,
    promo: valid ? { id: valid.id, code: valid.code } : null,
    promoError: error,
  };
}
