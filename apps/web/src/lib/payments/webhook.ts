import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfillPayment } from "@/lib/tournament/publish";
import { sessionMismatch, type CheckoutAction } from "./events";
import { simulationAllowed } from "./provider";
import { UUID_RE } from "./urls";

export type SessionAction = Extract<CheckoutAction, { sessionId: string }>;

/**
 * Applies a verified Checkout Session event to our payment. Returns a short
 * outcome for the logs; throws on database errors so that Stripe retries.
 */
export async function processCheckoutAction(action: SessionAction): Promise<string> {
  const admin = createAdminClient();
  const columns = "id, status, provider, stripe_checkout_session_id, amount_cents, currency";
  let payment = null;
  if (action.paymentId && UUID_RE.test(action.paymentId)) {
    const { data, error } = await admin.from("payments").select(columns).eq("id", action.paymentId).maybeSingle();
    if (error) throw error;
    payment = data;
  }
  if (!payment) {
    const { data, error } = await admin.from("payments").select(columns).eq("stripe_checkout_session_id", action.sessionId).maybeSingle();
    if (error) throw error;
    payment = data;
  }
  // Not ours (another app on the same Stripe account) or deleted: nothing to retry.
  if (!payment) return "unknown_payment";
  if (payment.provider === "free") return "ignored_free";
  if (payment.provider === "simulation" && !simulationAllowed()) {
    console.error(`[stripe webhook] simulated event for payment ${payment.id} refused in production`);
    return "ignored_simulation";
  }
  const mismatch = sessionMismatch(action, payment);
  if (mismatch) {
    console.error(`[stripe webhook] event ${action.eventId} does not match payment ${payment.id} (${mismatch})`);
    return `mismatch_${mismatch}`;
  }

  switch (action.kind) {
    case "fulfill": {
      const result = await fulfillPayment(payment.id, { paymentIntentId: action.paymentIntentId });
      return result.status;
    }
    case "fail":
    case "expire": {
      // Only a pending payment changes: a late "expired" never undoes a confirmed payment.
      const { data, error } = await admin
        .from("payments")
        .update({ status: action.kind === "fail" ? "failed" : "expired" })
        .eq("id", payment.id)
        .eq("status", "pending")
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) return `unchanged_${payment.status}`;
      return action.kind === "fail" ? "failed" : "expired";
    }
  }
}
