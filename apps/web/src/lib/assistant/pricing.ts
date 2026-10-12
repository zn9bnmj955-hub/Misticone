/**
 * Cost of a question, for quotas and the admin dashboard. Prices are in US
 * dollars per million tokens (Anthropic price list); the admin can override
 * them and the dollar → euro rate in app_settings ("ai.pricing").
 */
export type ModelPrice = { inputUsdPerMTok: number; outputUsdPerMTok: number; cacheReadUsdPerMTok?: number };

export const DEFAULT_PRICES: Record<string, ModelPrice> = {
  // Prompts up to 100K tokens (ours stay far below).
  "claude-haiku-5-5": { inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.5, cacheReadUsdPerMTok: 0.01 },
  "claude-sonnet-5-5": { inputUsdPerMTok: 2, outputUsdPerMTok: 10, cacheReadUsdPerMTok: 0.2 },
  "claude-opus-5-5": { inputUsdPerMTok: 4, outputUsdPerMTok: 20, cacheReadUsdPerMTok: 0.2 },
};

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/** Micro-euros (1 € = 1 000 000), rounded up so the budget is never underestimated. */
export function costMicroEur(usage: Usage, price: ModelPrice, usdToEur: number): number {
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const usd =
    (usage.input_tokens * price.inputUsdPerMTok +
      cacheWrite * price.inputUsdPerMTok * 1.25 +
      cacheRead * (price.cacheReadUsdPerMTok ?? price.inputUsdPerMTok * 0.1) +
      usage.output_tokens * price.outputUsdPerMTok) /
    1_000_000;
  return Math.ceil(usd * usdToEur * 1_000_000);
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
  };
}
