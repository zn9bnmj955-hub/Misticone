import { z } from "zod";

/**
 * Pure parsing of the assistant admin forms (settings, knowledge base,
 * search test), shared by the server actions and the unit tests. Error codes
 * map to `getMessages().adminAssistant.errors`.
 */

export const SETTINGS_FIELDS = [
  "model",
  "quotaGuest",
  "quotaAccount",
  "quotaPayingClub",
  "budget",
  "usdToEur",
  "priceInput",
  "priceOutput",
  "priceCacheRead",
] as const;
export type SettingsField = (typeof SETTINGS_FIELDS)[number];

export const KB_FIELDS = ["title", "sport", "sourceUrl", "body"] as const;
export type KbField = (typeof KB_FIELDS)[number];

export type FieldErrors<F extends string> = Partial<Record<F, string>>;
export type Parsed<T, F extends string> = { ok: true; value: T } | { ok: false; errors: FieldErrors<F> };

export const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Model ids look like "claude-haiku-5-5" (or a provider-prefixed variant). */
const MODEL_RE = /^[a-z0-9][a-z0-9._:@/-]{1,99}$/i;

/** The posted text values of a form (missing fields become ""). */
export function formFields<F extends string>(data: FormData, fields: readonly F[]): Record<F, string> {
  return Object.fromEntries(fields.map((f) => [f, String(data.get(f) ?? "")])) as Record<F, string>;
}

/** "0,92", " 20 ", "1.5" → number; "" or anything else → null. Negative values are refused. */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** Shown in an input: "0.92" → "0,92" (French decimals), integers unchanged. */
export function decimalInput(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v).replace(".", ",");
}

export type ModelPriceInput = { inputUsdPerMTok: number; outputUsdPerMTok: number; cacheReadUsdPerMTok?: number };

export type AiSettingsInput = {
  enabled: boolean;
  model: string;
  dailyQuota: { guest: number; account: number; paying_club: number };
  monthlyBudgetEur: number;
  usdToEur: number;
  /** null: no override, the default price list applies. */
  price: ModelPriceInput | null;
};

const MAX_QUOTA = 10_000;
const MAX_BUDGET_EUR = 100_000;
const MAX_PRICE_USD = 1_000;

export function parseSettingsForm(input: Record<SettingsField, string>, enabled: boolean): Parsed<AiSettingsInput, SettingsField> {
  const errors: FieldErrors<SettingsField> = {};
  const model = input.model.trim();
  if (!MODEL_RE.test(model)) errors.model = "model";

  const quota = (f: SettingsField) => {
    const v = parseDecimal(input[f]);
    if (v === null || !Number.isInteger(v) || v > MAX_QUOTA) {
      errors[f] = "quota";
      return 0;
    }
    return v;
  };
  const dailyQuota = { guest: quota("quotaGuest"), account: quota("quotaAccount"), paying_club: quota("quotaPayingClub") };

  const budget = parseDecimal(input.budget);
  if (budget === null || budget > MAX_BUDGET_EUR) errors.budget = "amount";
  const rate = parseDecimal(input.usdToEur);
  if (rate === null || rate <= 0 || rate > 10) errors.usdToEur = "rate";

  // Price override: input and output prices go together, the cache price is optional.
  let price: ModelPriceInput | null = null;
  const priceOf = (f: SettingsField) => {
    if (input[f].trim() === "") return undefined;
    const v = parseDecimal(input[f]);
    if (v === null || v > MAX_PRICE_USD) {
      errors[f] = "price";
      return undefined;
    }
    return v;
  };
  const pIn = priceOf("priceInput");
  const pOut = priceOf("priceOutput");
  const pCache = priceOf("priceCacheRead");
  const anyPrice = ["priceInput", "priceOutput", "priceCacheRead"].some((f) => input[f as SettingsField].trim() !== "");
  if (anyPrice) {
    if (input.priceInput.trim() === "") errors.priceInput = "pricePartial";
    if (input.priceOutput.trim() === "") errors.priceOutput = "pricePartial";
    if (pIn !== undefined && pOut !== undefined) {
      price = { inputUsdPerMTok: pIn, outputUsdPerMTok: pOut, ...(pCache !== undefined ? { cacheReadUsdPerMTok: pCache } : {}) };
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { enabled, model, dailyQuota, monthlyBudgetEur: budget!, usdToEur: rate!, price } };
}

/**
 * The stored price list ("ai.pricing": {model: price}) with the override of
 * one model set or removed; the other models keep theirs.
 */
export function mergePricing(stored: unknown, model: string, price: ModelPriceInput | null): Record<string, ModelPriceInput> {
  const base = stored && typeof stored === "object" && !Array.isArray(stored) ? { ...(stored as Record<string, ModelPriceInput>) } : {};
  if (price) base[model] = price;
  else delete base[model];
  return base;
}

/** Paragraphs the database will cut a document into (same rule as the kb_rechunk trigger: blank lines). */
export function countParagraphs(body: string): number {
  return body.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
}

export const KB_BODY_MAX = 50_000;

const kbSchema = z.object({
  title: z.string().trim().min(2).max(200),
  sport: z.string(),
  sourceUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || (/^https?:\/\//i.test(v) && URL.canParse(v))),
  body: z.string().trim().min(1).max(KB_BODY_MAX),
});
const KB_ERROR: Record<KbField, string> = { title: "title", sport: "sport", sourceUrl: "url", body: "body" };

export type KbDocumentInput = { title: string; sport_slug: string | null; source_url: string | null; body: string; published: boolean };

export function parseKbForm(input: Record<KbField, string>, published: boolean, sports: readonly string[]): Parsed<KbDocumentInput, KbField> {
  const errors: FieldErrors<KbField> = {};
  const parsed = kbSchema.safeParse(input);
  if (!parsed.success) for (const issue of parsed.error.issues) errors[issue.path[0] as KbField] ??= KB_ERROR[issue.path[0] as KbField];
  if (input.sport !== "" && !sports.includes(input.sport)) errors.sport = "sport";
  if (!parsed.success || Object.keys(errors).length > 0) return { ok: false, errors };
  const v = parsed.data;
  return {
    ok: true,
    // Windows line endings would hide the blank lines from the paragraph split.
    value: { title: v.title, sport_slug: v.sport || null, source_url: v.sourceUrl || null, body: v.body.replace(/\r\n?/g, "\n"), published },
  };
}

/** The « Tester une question » box: a question of 2 to 200 characters, optionally one sport. */
export function parseSearchForm(query: string, sport: string, sports: readonly string[]): { query: string; sport: string | null } | null {
  const q = query.trim();
  if (q.length < 2 || q.length > 200) return null;
  if (sport !== "" && !sports.includes(sport)) return null;
  return { query: q, sport: sport || null };
}
