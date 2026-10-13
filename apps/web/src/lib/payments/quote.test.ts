import { describe, expect, it } from "vitest";
import { checkPromo, normalizePromoCode, pickPlan, quote, type PlanRow, type PromoRow } from "./quote";

const plan = (p: Partial<PlanRow>): PlanRow => ({
  id: p.code ?? "x",
  code: "x",
  label: "Plan",
  description: null,
  price_cents: 2900,
  currency: "eur",
  sport_slug: null,
  max_teams: null,
  active: true,
  sort_order: 10,
  ...p,
});
const promo = (p: Partial<PromoRow>): PromoRow => ({
  id: "promo",
  code: "TEST",
  percent_off: null,
  amount_off_cents: null,
  max_redemptions: null,
  redemptions: 0,
  valid_until: null,
  active: true,
  ...p,
});
const NOW = Date.parse("2026-10-12T10:00:00Z");

describe("pickPlan", () => {
  const plans = [
    plan({ code: "generic", price_cents: 2900 }),
    plan({ code: "small", price_cents: 1900, max_teams: 16, sort_order: 20 }),
    plan({ code: "foot", price_cents: 3900, sport_slug: "football" }),
    plan({ code: "off", price_cents: 100, active: false }),
  ];
  it("prefers the smallest plan that fits", () => {
    expect(pickPlan(plans, "petanque", 12)?.code).toBe("small");
    expect(pickPlan(plans, "petanque", 64)?.code).toBe("generic");
  });
  it("prefers a plan made for the sport", () => {
    expect(pickPlan(plans, "football", 8)?.code).toBe("foot");
  });
  it("returns null when nothing applies", () => {
    expect(pickPlan([plan({ max_teams: 8 })], "petanque", 64)).toBeNull();
  });
});

describe("quote", () => {
  const p = plan({ price_cents: 2900 });
  it("applies percent and amount discounts, never below zero", () => {
    expect(quote(p, promo({ percent_off: 50 }), true, NOW).totalCents).toBe(1450);
    expect(quote(p, promo({ amount_off_cents: 5000 }), true, NOW).totalCents).toBe(0);
    expect(quote(p, promo({ percent_off: 100 }), true, NOW)).toMatchObject({ totalCents: 0, discountCents: 2900 });
  });
  it("reports unusable codes and charges the full price", () => {
    expect(quote(p, null, true, NOW)).toMatchObject({ promoError: "unknown", totalCents: 2900, promo: null });
    expect(quote(p, promo({ percent_off: 10, valid_until: "2026-01-01T00:00:00Z" }), true, NOW).promoError).toBe("expired");
    expect(quote(p, promo({ percent_off: 10, max_redemptions: 1, redemptions: 1 }), true, NOW).promoError).toBe("exhausted");
    expect(checkPromo(promo({ percent_off: 10, active: false }), NOW)).toBe("unknown");
  });
  it("never asks a card payment under 0,50 €", () => {
    expect(quote(p, promo({ amount_off_cents: 2880 }), true, NOW)).toMatchObject({ totalCents: 0, discountCents: 2900 });
    expect(quote(p, promo({ amount_off_cents: 2850 }), true, NOW).totalCents).toBe(50);
  });
  it("no code asked, no error", () => {
    expect(quote(p, null, false, NOW)).toMatchObject({ promoError: null, totalCents: 2900 });
  });
  it("normalizes typed codes", () => {
    expect(normalizePromoCode("  club 50 ")).toBe("CLUB50");
  });
});
