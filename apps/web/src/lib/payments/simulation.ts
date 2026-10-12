import "server-only";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSimulatedEvent, signPayload, type SimulatedEvent } from "./events";
import { SIMULATED_SESSION_RE } from "./urls";

/**
 * Local stand-in for Stripe Checkout (development only, see provider.ts).
 * The simulated hosted page builds Stripe-shaped events, signs them with
 * STRIPE_WEBHOOK_SECRET and posts them to our own webhook: publication goes
 * through exactly the code path a real Stripe payment uses.
 */
export async function findSimulatedPayment(sessionId: string) {
  if (!SIMULATED_SESSION_RE.test(sessionId)) return null;
  const { data, error } = await createAdminClient()
    .from("payments")
    .select(
      "id, status, tournament_id, club_id, amount_cents, discount_cents, currency, promo_code, customer_email, expires_at, form_snapshot, stripe_checkout_session_id, pricing_plans (label), tournaments (name)",
    )
    .eq("stripe_checkout_session_id", sessionId)
    .eq("provider", "simulation")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type SimulatedPayment = NonNullable<Awaited<ReturnType<typeof findSimulatedPayment>>>;

export const isOpen = (p: Pick<SimulatedPayment, "status" | "expires_at">, nowMs = Date.now()) =>
  p.status === "pending" && (!p.expires_at || new Date(p.expires_at).getTime() > nowMs);

export function simulatedEventFor(type: "checkout.session.completed" | "checkout.session.expired", p: SimulatedPayment): SimulatedEvent {
  return buildSimulatedEvent(type, {
    sessionId: p.stripe_checkout_session_id!,
    paymentId: p.id,
    tournamentId: p.tournament_id,
    clubId: p.club_id,
    amountCents: p.amount_cents,
    currency: p.currency,
    email: p.customer_email,
    expiresAt: p.expires_at,
  });
}

/** Signs the event like Stripe and posts it to our webhook. True when it was accepted. */
export async function deliverSimulatedEvent(event: SimulatedEvent): Promise<boolean> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[simulation] STRIPE_WEBHOOK_SECRET is not set: cannot sign the simulated event");
    return false;
  }
  const payload = JSON.stringify(event);
  const res = await fetch(`${env.siteUrl.replace(/\/$/, "")}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signPayload(payload, secret) },
    body: payload,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  }).catch((e: unknown) => {
    console.error("[simulation] webhook unreachable", e);
    return null;
  });
  if (res && !res.ok) console.error(`[simulation] webhook answered ${res.status}`);
  return res?.ok ?? false;
}
