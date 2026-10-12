import "server-only";

/**
 * Starting a payment for a draft tournament. OWNED BY THE PAYMENTS SLICE —
 * the creation form only calls startCheckout() and follows the result.
 *
 * Contract:
 * - checks that `userId` is a member of the tournament's club and that the
 *   tournament is still a draft;
 * - validates tournaments.draft_form on the server (validateForm), computes
 *   the price (quoteFor) and freezes the form on a new `payments` row
 *   (form_snapshot), expiring any previous pending payment of this tournament;
 * - total 0 € (promo code) → publishes right away, returns { kind: "published" };
 * - otherwise creates a checkout session with the configured provider
 *   (Stripe Checkout, or the local simulation when no Stripe key is set and
 *   we are not in production) and returns its URL.
 */
export type CheckoutError =
  | "forbidden"
  | "not_found"
  | "not_draft"
  | "invalid_form"
  | "no_plan"
  | "promo_invalid"
  | "provider_unavailable"
  | "provider_error";

export type CheckoutResult =
  | { kind: "redirect"; url: string }
  | { kind: "published"; tournamentId: string }
  | { kind: "error"; error: CheckoutError; issues?: { path: string; code: string }[] };

export async function startCheckout(input: {
  tournamentId: string;
  userId: string;
  promoCode?: string | null;
}): Promise<CheckoutResult> {
  void input;
  throw new Error("startCheckout: not implemented yet");
}
