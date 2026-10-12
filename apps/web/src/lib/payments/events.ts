import Stripe from "stripe";

/**
 * Stripe webhook events, as pure functions: signature check, what an event
 * means for us, cross-checks against the stored payment, and the
 * Stripe-shaped events produced by the local payment simulation (signed with
 * the same secret, so they go through exactly the same webhook code).
 */

export type CheckoutActionKind = "fulfill" | "fail" | "expire";

export type CheckoutAction =
  | {
      kind: CheckoutActionKind;
      eventId: string;
      sessionId: string;
      /** Our payments.id (client_reference_id, or metadata.payment_id). */
      paymentId: string | null;
      amountTotal: number | null;
      currency: string | null;
      paymentIntentId: string | null;
    }
  | { kind: "ignore"; eventId: string; reason: "unhandled_type" | "not_paid" };

/** The verified event, or null when the payload was not signed by Stripe with this secret (or is too old). */
export function verifyWebhook(payload: string, signature: string | null | undefined, secret: string | null | undefined): Stripe.Event | null {
  if (!signature || !secret) return null;
  try {
    return Stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return null;
  }
}

/** A `stripe-signature` header for `payload`, computed exactly like Stripe does. */
export function signPayload(payload: string, secret: string, timestampSeconds?: number): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret, ...(timestampSeconds !== undefined && { timestamp: timestampSeconds }) });
}

function sessionFields(session: Stripe.Checkout.Session) {
  const pi = session.payment_intent;
  return {
    sessionId: session.id,
    paymentId: session.client_reference_id || session.metadata?.payment_id || null,
    amountTotal: session.amount_total ?? null,
    currency: session.currency ?? null,
    paymentIntentId: typeof pi === "string" ? pi : (pi?.id ?? null),
  };
}

/**
 * What a webhook event asks us to do. Only Checkout Session events matter:
 * - completed and paid (cards, wallets) or async payment succeeded → publish;
 * - completed but not paid yet (bank debits): wait for the async event;
 * - async payment failed → failed; session expired → expired.
 */
export function classifyEvent(event: Stripe.Event): CheckoutAction {
  switch (event.type) {
    case "checkout.session.completed":
      if (event.data.object.payment_status !== "paid") return { kind: "ignore", eventId: event.id, reason: "not_paid" };
      return { kind: "fulfill", eventId: event.id, ...sessionFields(event.data.object) };
    case "checkout.session.async_payment_succeeded":
      return { kind: "fulfill", eventId: event.id, ...sessionFields(event.data.object) };
    case "checkout.session.async_payment_failed":
      return { kind: "fail", eventId: event.id, ...sessionFields(event.data.object) };
    case "checkout.session.expired":
      return { kind: "expire", eventId: event.id, ...sessionFields(event.data.object) };
    default:
      return { kind: "ignore", eventId: event.id, reason: "unhandled_type" };
  }
}

export type StoredPayment = { stripe_checkout_session_id: string | null; amount_cents: number; currency: string };

/**
 * Refuses an event that does not describe the checkout we created: another
 * session, or (for a payment) another amount or currency.
 */
export function sessionMismatch(
  action: Extract<CheckoutAction, { sessionId: string }>,
  payment: StoredPayment,
): "session" | "amount" | "currency" | null {
  if (!payment.stripe_checkout_session_id || payment.stripe_checkout_session_id !== action.sessionId) return "session";
  if (action.kind === "fulfill") {
    if (action.amountTotal !== payment.amount_cents) return "amount";
    if ((action.currency ?? "").toLowerCase() !== payment.currency.toLowerCase()) return "currency";
  }
  return null;
}

export type SimulatedSession = {
  sessionId: string;
  paymentId: string;
  tournamentId: string;
  clubId: string;
  amountCents: number;
  currency: string;
  email: string | null;
  expiresAt: string | null;
};

const randomId = () => crypto.randomUUID().replace(/-/g, "");

/**
 * A Stripe-shaped Checkout Session event, as the local simulation sends it
 * to our own webhook: the same fields our code reads from real events.
 */
export function buildSimulatedEvent(
  type: "checkout.session.completed" | "checkout.session.expired",
  s: SimulatedSession,
  nowMs = Date.now(),
) {
  const created = Math.floor(nowMs / 1000);
  const paid = type === "checkout.session.completed";
  return {
    id: `evt_sim_${randomId()}`,
    object: "event" as const,
    api_version: Stripe.API_VERSION,
    created,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: {
      object: {
        id: s.sessionId,
        object: "checkout.session" as const,
        mode: "payment" as const,
        livemode: false,
        client_reference_id: s.paymentId,
        metadata: { payment_id: s.paymentId, tournament_id: s.tournamentId, club_id: s.clubId },
        amount_subtotal: s.amountCents,
        amount_total: s.amountCents,
        currency: s.currency,
        customer_email: s.email,
        customer_details: s.email ? { email: s.email } : null,
        payment_intent: paid ? `pi_sim_${randomId()}` : null,
        payment_status: paid ? ("paid" as const) : ("unpaid" as const),
        status: paid ? ("complete" as const) : ("expired" as const),
        created,
        expires_at: s.expiresAt ? Math.floor(new Date(s.expiresAt).getTime() / 1000) : created,
        url: null,
      },
    },
  };
}

export type SimulatedEvent = ReturnType<typeof buildSimulatedEvent>;
