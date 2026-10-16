/**
 * Entry fee of the concours B, read from a stored tournaments.config.
 * Only a B with sign-up (opt_in) has one; it is information only (paid on
 * site). Light on purpose: the poster and the detail page read it without
 * loading the engine.
 */
export function consolationFeeOf(config: unknown): number | null {
  const b = (config as { consolation?: { enabled?: unknown; entry?: unknown; feeCents?: unknown } } | null)?.consolation;
  if (!b || b.enabled !== true || b.entry !== "opt_in") return null;
  const fee = b.feeCents;
  return typeof fee === "number" && Number.isInteger(fee) && fee > 0 ? fee : null;
}
