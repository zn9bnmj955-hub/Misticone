import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { buildSimulatedEvent, classifyEvent, sessionMismatch, signPayload, verifyWebhook, type SimulatedSession } from "./events";

const SECRET = "whsec_test_secret_for_unit_tests_only";
const session: SimulatedSession = {
  sessionId: "sim_6f1c2a4e-7d1b-4c55-9a2f-0b8e3c9d1a77",
  paymentId: "0d4f6a43-2b9e-4c1a-8f57-5e2a9b0c7d31",
  tournamentId: "4dbbf947-2117-4814-ba42-262ae4698cdd",
  clubId: "843e1286-fe8e-4486-8189-836f21d047ac",
  amountCents: 2900,
  currency: "eur",
  email: "orga@example.fr",
  expiresAt: "2026-10-12T12:30:00Z",
};

/** A Stripe-like event with a Checkout Session payload. */
function stripeEvent(type: string, object: Record<string, unknown>): Stripe.Event {
  return { id: "evt_1", object: "event", type, data: { object: { object: "checkout.session", ...object } } } as unknown as Stripe.Event;
}

describe("webhook signature", () => {
  const payload = JSON.stringify(buildSimulatedEvent("checkout.session.completed", session));

  it("accepts a payload signed with the secret", () => {
    const event = verifyWebhook(payload, signPayload(payload, SECRET), SECRET);
    expect(event?.type).toBe("checkout.session.completed");
  });

  it("rejects a tampered payload", () => {
    const signature = signPayload(payload, SECRET);
    const tampered = payload.replace('"amount_total":2900', '"amount_total":1');
    expect(tampered).not.toBe(payload);
    expect(verifyWebhook(tampered, signature, SECRET)).toBeNull();
  });

  it("rejects unsigned payloads, wrong secrets and garbage headers", () => {
    expect(verifyWebhook(payload, null, SECRET)).toBeNull();
    expect(verifyWebhook(payload, "", SECRET)).toBeNull();
    expect(verifyWebhook(payload, "t=1,v1=deadbeef", SECRET)).toBeNull();
    expect(verifyWebhook(payload, signPayload(payload, "whsec_another_secret"), SECRET)).toBeNull();
    expect(verifyWebhook(payload, signPayload(payload, SECRET), "")).toBeNull();
  });

  it("rejects replayed events (old timestamp)", () => {
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    expect(verifyWebhook(payload, signPayload(payload, SECRET, oneHourAgo), SECRET)).toBeNull();
  });
});

describe("classifyEvent", () => {
  const base = { id: "cs_test_1", client_reference_id: "pay_1", amount_total: 2900, currency: "eur", payment_intent: "pi_1" };

  it("publishes a completed and paid session", () => {
    expect(classifyEvent(stripeEvent("checkout.session.completed", { ...base, payment_status: "paid" }))).toEqual({
      kind: "fulfill",
      eventId: "evt_1",
      sessionId: "cs_test_1",
      paymentId: "pay_1",
      amountTotal: 2900,
      currency: "eur",
      paymentIntentId: "pi_1",
    });
  });

  it("waits when a completed session is not paid yet (bank debit)", () => {
    expect(classifyEvent(stripeEvent("checkout.session.completed", { ...base, payment_status: "unpaid" }))).toMatchObject({ kind: "ignore", reason: "not_paid" });
  });

  it("maps async results and expiry", () => {
    expect(classifyEvent(stripeEvent("checkout.session.async_payment_succeeded", base)).kind).toBe("fulfill");
    expect(classifyEvent(stripeEvent("checkout.session.async_payment_failed", base)).kind).toBe("fail");
    expect(classifyEvent(stripeEvent("checkout.session.expired", base)).kind).toBe("expire");
  });

  it("ignores other events", () => {
    expect(classifyEvent(stripeEvent("payment_intent.succeeded", base))).toMatchObject({ kind: "ignore", reason: "unhandled_type" });
  });

  it("falls back to the metadata and expanded payment intents", () => {
    const action = classifyEvent(
      stripeEvent("checkout.session.async_payment_succeeded", {
        ...base,
        client_reference_id: null,
        metadata: { payment_id: "pay_meta" },
        payment_intent: { id: "pi_expanded" },
      }),
    );
    expect(action).toMatchObject({ paymentId: "pay_meta", paymentIntentId: "pi_expanded" });
  });
});

describe("sessionMismatch", () => {
  const stored = { stripe_checkout_session_id: "cs_test_1", amount_cents: 2900, currency: "eur" };
  const action = {
    kind: "fulfill" as const,
    eventId: "evt_1",
    sessionId: "cs_test_1",
    paymentId: "pay_1",
    amountTotal: 2900,
    currency: "EUR",
    paymentIntentId: null,
  };

  it("accepts the session we created", () => {
    expect(sessionMismatch(action, stored)).toBeNull();
  });

  it("refuses another session, amount or currency", () => {
    expect(sessionMismatch({ ...action, sessionId: "cs_other" }, stored)).toBe("session");
    expect(sessionMismatch(action, { ...stored, stripe_checkout_session_id: null })).toBe("session");
    expect(sessionMismatch({ ...action, amountTotal: 100 }, stored)).toBe("amount");
    expect(sessionMismatch({ ...action, currency: "usd" }, stored)).toBe("currency");
  });

  it("does not check the amount of an expiry", () => {
    expect(sessionMismatch({ ...action, kind: "expire", amountTotal: null }, stored)).toBeNull();
  });
});

describe("simulated events", () => {
  it("look like Stripe Checkout events and go through the same checks", () => {
    const event = buildSimulatedEvent("checkout.session.completed", session, Date.parse("2026-10-12T12:00:00Z"));
    expect(event).toMatchObject({
      object: "event",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: session.sessionId,
          object: "checkout.session",
          client_reference_id: session.paymentId,
          metadata: { payment_id: session.paymentId, tournament_id: session.tournamentId, club_id: session.clubId },
          payment_status: "paid",
          status: "complete",
          amount_total: 2900,
          currency: "eur",
          customer_details: { email: "orga@example.fr" },
        },
      },
    });
    expect(event.id).toMatch(/^evt_sim_/);
    expect(event.data.object.payment_intent).toMatch(/^pi_sim_/);
    expect(event.created).toBe(Date.parse("2026-10-12T12:00:00Z") / 1000);

    const payload = JSON.stringify(event);
    const verified = verifyWebhook(payload, signPayload(payload, SECRET), SECRET);
    expect(verified).not.toBeNull();
    const action = classifyEvent(verified!);
    expect(action).toMatchObject({ kind: "fulfill", sessionId: session.sessionId, paymentId: session.paymentId, amountTotal: 2900 });
    if (action.kind === "ignore") throw new Error("unexpected");
    expect(sessionMismatch(action, { stripe_checkout_session_id: session.sessionId, amount_cents: 2900, currency: "eur" })).toBeNull();
  });

  it("expired sessions are unpaid", () => {
    const event = buildSimulatedEvent("checkout.session.expired", session);
    expect(event.data.object).toMatchObject({ payment_status: "unpaid", status: "expired", payment_intent: null });
    expect(classifyEvent(event as unknown as Stripe.Event).kind).toBe("expire");
  });
});
