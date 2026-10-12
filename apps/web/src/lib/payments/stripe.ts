import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

/**
 * Stripe API client, created on first use so that pages and builds never
 * need the secret key. Only called when selectProvider() chose "stripe".
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "OrgaSport" } });
  return client;
}
