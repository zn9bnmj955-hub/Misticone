import { z } from "zod";
import { checkPromo, type PromoRow } from "@/lib/payments/quote";
import { DATE_RE, isoToParis, parisToIso } from "@/lib/tournament-form/time";

/**
 * Pure parsing of the admin forms (pricing plans and promo codes). Shared by
 * the server actions (the only place where values are trusted) and the tests.
 * Errors are codes; their French texts live in `getMessages().admin.errors`.
 */

/** Upper bound for any price typed in the admin (100 000 €): catches typos like an extra zero or two. */
export const MAX_CENTS = 10_000_000;

/** Plan codes are internal identifiers: lowercase, digits and dashes. */
export const PLAN_CODE_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
/** Same rule as the database check on promo_codes.code. */
export const PROMO_CODE_RE = /^[A-Z0-9_-]{3,32}$/;

/**
 * "29", "29,5", "29,50 €", "1 234,56" or "29.50" → cents. Null when the text
 * is not a positive amount with at most two decimals.
 */
export function parseEurosToCents(raw: string | null | undefined): number | null {
  const text = (raw ?? "").replace(/[\s  ]/g, "").replace(/€$/, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole = "0", decimals = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null;
}

/** 2900 → "29", 2950 → "29,50": the value shown back in a price field. */
export function centsToEurosInput(cents: number): string {
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(whole) : `${whole},${String(rest).padStart(2, "0")}`;
}

/** Promo codes are typed loosely ("bienvenue 2026") and stored strictly ("BIENVENUE2026"). */
export function normalizeAdminCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/** A "valid until" day is inclusive: the code works until 23:59:59 that day, Paris time. */
export function endOfParisDay(date: string): string {
  return new Date(new Date(parisToIso(date, "23:59")).getTime() + 59_999).toISOString();
}

/** Stored instant → the Paris day shown in the date field. */
export function parisDayOf(iso: string | null | undefined): string {
  return iso ? isoToParis(iso).date : "";
}

/** Reads the named fields of a form as trimmed strings (missing → ""). */
export function formFields<K extends string>(data: FormData, keys: readonly K[]): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of keys) {
    const v = data.get(k);
    out[k] = typeof v === "string" ? v.trim() : "";
  }
  return out;
}

export type FieldErrors<F extends string> = Partial<Record<F, string>>;
export type Parsed<T, F extends string> = { ok: true; value: T } | { ok: false; errors: FieldErrors<F> };

function toFieldErrors<F extends string>(error: z.ZodError): FieldErrors<F> {
  const errors: FieldErrors<F> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form") as F;
    errors[field] ??= issue.message;
  }
  return errors;
}

const checked = (v: string) => v === "on" || v === "true" || v === "1";

/** Optional whole number: "" → null; otherwise an integer in [min, max]. */
function optionalInt(min: number, max: number, code: string) {
  return z.string().transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v);
    if (!/^\d+$/.test(v) || !Number.isSafeInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: code });
      return z.NEVER;
    }
    return n;
  });
}

// ---------------------------------------------------------------------------
// Pricing plans
// ---------------------------------------------------------------------------

export const PLAN_FIELDS = ["code", "label", "description", "price", "sport", "maxTeams", "active", "sortOrder"] as const;
export type PlanField = (typeof PLAN_FIELDS)[number];

export type PlanValues = {
  code: string;
  label: string;
  description: string | null;
  price_cents: number;
  sport_slug: string | null;
  max_teams: number | null;
  active: boolean;
  sort_order: number;
};

/** `sports`: slugs a plan may target (enabled sports); "" means every sport. */
export function parsePlanForm(fields: Record<PlanField, string>, sports: readonly string[]): Parsed<PlanValues, PlanField> {
  const schema = z.object({
    code: z.string().transform((v) => v.toLowerCase()).pipe(z.string().regex(PLAN_CODE_RE, "planCode")),
    label: z.string().min(2, "label").max(80, "label"),
    description: z.string().max(300, "description").transform((v) => v || null),
    price: z.string().transform((v, ctx) => {
      const cents = parseEurosToCents(v);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: "price" });
        return z.NEVER;
      }
      return cents;
    }),
    sport: z.string().refine((v) => v === "" || sports.includes(v), "sport").transform((v) => v || null),
    maxTeams: optionalInt(2, 10_000, "maxTeams"),
    active: z.string().transform(checked),
    sortOrder: optionalInt(0, 10_000, "sortOrder").transform((v) => v ?? 100),
  });
  const res = schema.safeParse(fields);
  if (!res.success) return { ok: false, errors: toFieldErrors(res.error) };
  const v = res.data;
  return {
    ok: true,
    value: {
      code: v.code,
      label: v.label,
      description: v.description,
      price_cents: v.price,
      sport_slug: v.sport,
      max_teams: v.maxTeams,
      active: v.active,
      sort_order: v.sortOrder,
    },
  };
}

// ---------------------------------------------------------------------------
// Promo codes
// ---------------------------------------------------------------------------

export const PROMO_FIELDS = ["code", "description", "kind", "percent", "amount", "maxRedemptions", "validUntil", "active"] as const;
export type PromoField = (typeof PROMO_FIELDS)[number];
export type PromoKind = "percent" | "amount";

export type PromoValues = {
  description: string | null;
  percent_off: number | null;
  amount_off_cents: number | null;
  max_redemptions: number | null;
  valid_until: string | null;
  active: boolean;
};

/**
 * `isNew`: the code is only chosen at creation. Afterwards it is printed on
 * flyers and copied on payments, so it is never renamed (deactivate it and
 * create another one instead).
 */
export function parsePromoForm(
  fields: Record<PromoField, string>,
  isNew: boolean,
): Parsed<PromoValues & { code: string | null }, PromoField> {
  const schema = z
    .object({
      code: z.string().transform(normalizeAdminCode),
      description: z.string().max(200, "description").transform((v) => v || null),
      kind: z.enum(["percent", "amount"], "kind"),
      percent: z.string(),
      amount: z.string(),
      maxRedemptions: optionalInt(1, 1_000_000, "maxRedemptions"),
      validUntil: z.string().refine((v) => v === "" || DATE_RE.test(v), "validUntil"),
      active: z.string().transform(checked),
    })
    .superRefine((v, ctx) => {
      if (isNew && !PROMO_CODE_RE.test(v.code)) ctx.addIssue({ code: "custom", path: ["code"], message: "promoCode" });
      if (v.kind === "percent") {
        const n = Number(v.percent);
        if (!/^\d+$/.test(v.percent) || n < 1 || n > 100) ctx.addIssue({ code: "custom", path: ["percent"], message: "percent" });
      } else {
        const cents = parseEurosToCents(v.amount);
        if (cents === null || cents === 0) ctx.addIssue({ code: "custom", path: ["amount"], message: "amount" });
      }
    });
  const res = schema.safeParse(fields);
  if (!res.success) return { ok: false, errors: toFieldErrors(res.error) };
  const v = res.data;
  return {
    ok: true,
    value: {
      code: isNew ? v.code : null,
      description: v.description,
      percent_off: v.kind === "percent" ? Number(v.percent) : null,
      amount_off_cents: v.kind === "amount" ? parseEurosToCents(v.amount) : null,
      max_redemptions: v.maxRedemptions,
      valid_until: v.validUntil ? endOfParisDay(v.validUntil) : null,
      active: v.active,
    },
  };
}

/** Where a promo code stands today, for the badge in the list (same rules as the checkout). */
export type PromoState = "active" | "inactive" | "expired" | "exhausted";

export function promoState(p: PromoRow, nowMs: number): PromoState {
  const error = checkPromo(p, nowMs);
  return error === null ? "active" : error === "unknown" ? "inactive" : error;
}
