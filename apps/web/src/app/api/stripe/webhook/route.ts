import type { NextRequest } from "next/server";
import { classifyEvent, verifyWebhook } from "@/lib/payments/events";
import { processCheckoutAction } from "@/lib/payments/webhook";
import { json } from "@/lib/tournament/http";

/**
 * Stripe webhook: the only way a paid tournament gets published. The raw
 * body is checked against the `stripe-signature` header with
 * STRIPE_WEBHOOK_SECRET (the local payment simulation signs its events the
 * same way). 400 on a bad signature, 500 on a transient failure so that
 * Stripe retries (fulfillment is idempotent), 200 otherwise.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set");
    return json({ error: { code: "NOT_CONFIGURED" } }, 500);
  }
  const payload = await request.text();
  const event = verifyWebhook(payload, request.headers.get("stripe-signature"), secret);
  if (!event) return json({ error: { code: "BAD_SIGNATURE" } }, 400);

  const action = classifyEvent(event);
  if (action.kind === "ignore") return json({ received: true, outcome: `ignored_${action.reason}` });
  try {
    const outcome = await processCheckoutAction(action);
    return json({ received: true, outcome });
  } catch (e) {
    console.error(`[stripe webhook] ${event.type} ${event.id} failed`, e);
    return json({ error: { code: "RETRY" } }, 500);
  }
}
