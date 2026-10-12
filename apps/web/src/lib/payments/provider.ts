/**
 * Which payment provider takes the money.
 *
 * - Stripe Checkout as soon as STRIPE_SECRET_KEY is set;
 * - otherwise, outside production, a local simulation that mimics Stripe
 *   (hosted page + signed webhook) so the whole flow works without an account;
 * - otherwise nothing: payments are unavailable (never a silent fallback in
 *   production).
 *
 * PAYMENTS_SIMULATION=1 forces the simulation outside production (end-to-end
 * tests with a Stripe key set); PAYMENTS_SIMULATION=0 turns it off to try the
 * "unavailable" path. The simulation is always refused in production.
 *
 * Pure (reads only the given environment) so it can be unit-tested; the
 * Stripe client itself lives in stripe.ts (server only).
 */
export type CheckoutProvider = "stripe" | "simulation";

type PaymentEnv = {
  NODE_ENV?: string;
  STRIPE_SECRET_KEY?: string;
  PAYMENTS_SIMULATION?: string;
};

export function simulationAllowed(env: PaymentEnv = process.env): boolean {
  return env.NODE_ENV !== "production";
}

export function selectProvider(env: PaymentEnv = process.env): CheckoutProvider | null {
  const simulation = env.PAYMENTS_SIMULATION?.trim();
  if (simulationAllowed(env) && simulation === "1") return "simulation";
  if (env.STRIPE_SECRET_KEY?.trim()) return "stripe";
  if (simulationAllowed(env) && simulation !== "0") return "simulation";
  return null;
}
