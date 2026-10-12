import { describe, expect, it } from "vitest";
import {
  centsToEurosInput,
  endOfParisDay,
  parisDayOf,
  parseEurosToCents,
  parsePlanForm,
  parsePromoForm,
  promoState,
  type PlanField,
  type PromoField,
} from "./forms";

describe("euros ↔ cents", () => {
  it.each([
    ["29", 2900],
    ["29,5", 2950],
    ["29,50", 2950],
    ["29.05", 2905],
    ["29 €", 2900],
    ["29€", 2900],
    ["1 234,56", 123456],
    ["1 234,56", 123456],
    ["0", 0],
    [" 19 ", 1900],
  ])("%j → %i cents", (raw, cents) => {
    expect(parseEurosToCents(raw)).toBe(cents);
  });

  it.each(["", "abc", "-5", "29,555", "29,", ",50", "1e3", "29,5,0", "100000,01", "12 345 678"])("%j is refused", (raw) => {
    expect(parseEurosToCents(raw)).toBeNull();
  });

  it("formats cents back for the input field", () => {
    expect(centsToEurosInput(2900)).toBe("29");
    expect(centsToEurosInput(2950)).toBe("29,50");
    expect(centsToEurosInput(2905)).toBe("29,05");
    expect(centsToEurosInput(0)).toBe("0");
    for (const c of [0, 1, 99, 100, 1999, 123456]) expect(parseEurosToCents(centsToEurosInput(c))).toBe(c);
  });
});

describe("valid until (Paris day, inclusive)", () => {
  it("ends at 23:59:59.999 Paris time, summer and winter", () => {
    expect(endOfParisDay("2026-07-14")).toBe("2026-07-14T21:59:59.999Z");
    expect(endOfParisDay("2026-12-31")).toBe("2026-12-31T22:59:59.999Z");
    expect(parisDayOf(endOfParisDay("2026-03-29"))).toBe("2026-03-29");
    expect(parisDayOf(null)).toBe("");
  });
});

const plan = (over: Partial<Record<PlanField, string>> = {}): Record<PlanField, string> => ({
  code: "lien-concours",
  label: "Lien concours",
  description: "",
  price: "29",
  sport: "",
  maxTeams: "",
  active: "on",
  sortOrder: "10",
  ...over,
});

describe("pricing plan form", () => {
  const sports = ["petanque", "football"];

  it("accepts a plan for every sport without team limit", () => {
    const res = parsePlanForm(plan(), sports);
    expect(res).toEqual({
      ok: true,
      value: {
        code: "lien-concours",
        label: "Lien concours",
        description: null,
        price_cents: 2900,
        sport_slug: null,
        max_teams: null,
        active: true,
        sort_order: 10,
      },
    });
  });

  it("reads a sport, a team limit, an unchecked box and a default order", () => {
    const res = parsePlanForm(plan({ code: "Petit", sport: "petanque", maxTeams: "16", active: "", sortOrder: "", price: "19,90" }), sports);
    expect(res.ok && res.value).toMatchObject({ code: "petit", sport_slug: "petanque", max_teams: 16, active: false, sort_order: 100, price_cents: 1990 });
  });

  it("reports each wrong field with its own code", () => {
    const res = parsePlanForm(plan({ code: "a b", label: "", price: "gratuit", sport: "curling", maxTeams: "1", sortOrder: "-3" }), sports);
    expect(res.ok).toBe(false);
    if (!res.ok)
      expect(res.errors).toEqual({ code: "planCode", label: "label", price: "price", sport: "sport", maxTeams: "maxTeams", sortOrder: "sortOrder" });
  });
});

const promo = (over: Partial<Record<PromoField, string>> = {}): Record<PromoField, string> => ({
  code: "bienvenue 2026",
  description: "",
  kind: "percent",
  percent: "100",
  amount: "",
  maxRedemptions: "",
  validUntil: "",
  active: "on",
  ...over,
});

describe("promo code form", () => {
  it("normalizes the code and keeps a percentage only", () => {
    const res = parsePromoForm(promo({ amount: "5" }), true);
    expect(res).toEqual({
      ok: true,
      value: {
        code: "BIENVENUE2026",
        description: null,
        percent_off: 100,
        amount_off_cents: null,
        max_redemptions: null,
        valid_until: null,
        active: true,
      },
    });
  });

  it("keeps a fixed amount only, with a limit and a last day", () => {
    const res = parsePromoForm(promo({ kind: "amount", percent: "50", amount: "10,50", maxRedemptions: "20", validUntil: "2026-12-31" }), true);
    expect(res.ok && res.value).toMatchObject({
      percent_off: null,
      amount_off_cents: 1050,
      max_redemptions: 20,
      valid_until: "2026-12-31T22:59:59.999Z",
    });
  });

  it("refuses invalid codes, percentages and amounts", () => {
    const bad = parsePromoForm(promo({ code: "é!", percent: "0" }), true);
    expect(bad.ok === false && bad.errors).toEqual({ code: "promoCode", percent: "percent" });
    expect(parsePromoForm(promo({ percent: "101" }), true).ok).toBe(false);
    expect(parsePromoForm(promo({ percent: "12.5" }), true).ok).toBe(false);
    const amount = parsePromoForm(promo({ kind: "amount", amount: "0" }), true);
    expect(amount.ok === false && amount.errors).toEqual({ amount: "amount" });
    const other = parsePromoForm(promo({ kind: "gift", maxRedemptions: "0", validUntil: "31/12/2026" }), true);
    expect(other.ok === false && other.errors).toMatchObject({ kind: "kind", maxRedemptions: "maxRedemptions", validUntil: "validUntil" });
  });

  it("never renames an existing code", () => {
    const res = parsePromoForm(promo({ code: "" }), false);
    expect(res.ok && res.value.code).toBeNull();
  });
});

describe("promo state", () => {
  const base = { id: "p", code: "X", percent_off: 10, amount_off_cents: null, max_redemptions: null, redemptions: 0, valid_until: null, active: true };
  const now = Date.parse("2026-10-12T10:00:00Z");
  it("follows the checkout rules", () => {
    expect(promoState(base, now)).toBe("active");
    expect(promoState({ ...base, active: false }, now)).toBe("inactive");
    expect(promoState({ ...base, valid_until: "2026-10-11T21:59:59.999Z" }, now)).toBe("expired");
    expect(promoState({ ...base, max_redemptions: 3, redemptions: 3 }, now)).toBe("exhausted");
  });
});
