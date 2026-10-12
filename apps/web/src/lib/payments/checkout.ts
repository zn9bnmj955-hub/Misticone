import "server-only";
import { getSport } from "@orgasport/sports";
import type { Enums, Json } from "@orgasport/db";
import { fmt, getMessages } from "@/i18n";
import { env } from "@/lib/env";
import { formatDay } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfillPayment } from "@/lib/tournament/publish";
import { parisDatePlus, parisToIso, validateForm } from "@/lib/tournament-form";
import { quoteFor } from "./pricing";
import { selectProvider } from "./provider";
import { getStripe } from "./stripe";
import { checkoutCancelPath, paymentResultPath, simulationPath } from "./urls";

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

/** A checkout page stays usable 30 minutes (Stripe's minimum; one more minute for the request itself). */
const CHECKOUT_MINUTES = 31;
const UNIQUE_VIOLATION = "23505";

const fail = (error: CheckoutError): CheckoutResult => ({ kind: "error", error });

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Closes the checkouts still open for this tournament: starting a new
 * payment replaces them (the form or the price may have changed). Stripe
 * sessions are expired on Stripe's side too, so an old tab cannot be paid.
 */
async function expirePendingPayments(admin: Admin, tournamentId: string): Promise<void> {
  const { data, error } = await admin
    .from("payments")
    .select("id, provider, stripe_checkout_session_id")
    .eq("tournament_id", tournamentId)
    .eq("status", "pending");
  if (error) throw error;
  if (!data || data.length === 0) return;
  for (const p of data) {
    if (p.provider !== "stripe" || !p.stripe_checkout_session_id || !process.env.STRIPE_SECRET_KEY) continue;
    try {
      await getStripe().checkout.sessions.expire(p.stripe_checkout_session_id);
    } catch (e) {
      // Already completed or expired: the webhook decides what happened.
      console.warn(`[checkout] could not expire Stripe session of payment ${p.id}`, e instanceof Error ? e.message : e);
    }
  }
  const { error: updateError } = await admin
    .from("payments")
    .update({ status: "expired" })
    .in(
      "id",
      data.map((p) => p.id),
    )
    .eq("status", "pending");
  if (updateError) throw updateError;
}

export async function startCheckout(input: {
  tournamentId: string;
  userId: string;
  promoCode?: string | null;
}): Promise<CheckoutResult> {
  try {
    return await checkout(input);
  } catch (e) {
    console.error("[checkout] unexpected error", e);
    return fail("provider_error");
  }
}

async function checkout(input: { tournamentId: string; userId: string; promoCode?: string | null }): Promise<CheckoutResult> {
  const admin = createAdminClient();
  const { data: tournament, error } = await admin
    .from("tournaments")
    .select("id, club_id, status, draft_form")
    .eq("id", input.tournamentId)
    .maybeSingle();
  if (error) throw error;
  if (!tournament) return fail("not_found");

  // The service role bypasses RLS: membership is checked here, explicitly.
  const { data: member, error: memberError } = await admin
    .from("club_members")
    .select("user_id")
    .eq("club_id", tournament.club_id)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) return fail("forbidden");
  if (tournament.status !== "draft") return fail("not_draft");

  const valid = validateForm(tournament.draft_form, getSport, parisDatePlus(Date.now(), 0));
  if (!valid.ok) return { kind: "error", error: "invalid_form", issues: valid.issues };
  const { form, sport } = valid;

  const quote = await quoteFor({ sportSlug: sport.slug, maxTeams: form.maxTeams, promoCode: input.promoCode });
  if (!quote) return fail("no_plan");
  if (quote.promoError) return fail("promo_invalid");

  const provider: Enums<"payment_provider"> | null = quote.totalCents === 0 ? "free" : selectProvider();
  if (!provider) return fail("provider_unavailable");

  const expiresAt = new Date(Date.now() + CHECKOUT_MINUTES * 60_000);
  const simulatedSession = provider === "simulation" ? `sim_${crypto.randomUUID()}` : null;
  const row = {
    tournament_id: tournament.id,
    club_id: tournament.club_id,
    pricing_plan_id: quote.plan.id,
    provider,
    status: "pending" as const,
    amount_cents: quote.totalCents,
    discount_cents: quote.discountCents,
    currency: quote.currency,
    promo_code_id: quote.promo?.id ?? null,
    promo_code: quote.promo?.code ?? null,
    form_snapshot: form as unknown as NonNullable<Json>,
    customer_email: form.organizer.email,
    created_by: input.userId,
    ...(simulatedSession && {
      stripe_checkout_session_id: simulatedSession,
      checkout_url: simulationPath(simulatedSession),
      expires_at: expiresAt.toISOString(),
    }),
  };

  // One checkout at a time per tournament (unique index): replace the old one.
  let payment: { id: string } | null = null;
  for (let attempt = 0; attempt < 2 && !payment; attempt++) {
    await expirePendingPayments(admin, tournament.id);
    const { data, error: insertError } = await admin.from("payments").insert(row).select("id").single();
    if (data) payment = data;
    else if (insertError?.code !== UNIQUE_VIOLATION) throw insertError;
  }
  if (!payment) return fail("provider_error");

  if (provider === "free") {
    try {
      await fulfillPayment(payment.id);
    } catch (e) {
      console.error(`[checkout] free publication of payment ${payment.id} failed`, e);
      await admin.from("payments").update({ status: "failed" }).eq("id", payment.id).eq("status", "pending");
      return fail("provider_error");
    }
    return { kind: "published", tournamentId: tournament.id };
  }

  if (provider === "simulation") return { kind: "redirect", url: simulationPath(simulatedSession!) };

  // Stripe Checkout: Stripe picks the payment methods enabled in the
  // dashboard (cards with 3-D Secure, Apple Pay, Google Pay, PayPal…).
  const m = getMessages().payment.stripe;
  const metadata = { payment_id: payment.id, tournament_id: tournament.id, club_id: tournament.club_id };
  const site = env.siteUrl.replace(/\/$/, "");
  try {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: quote.currency,
              unit_amount: quote.totalCents,
              product_data: {
                name: fmt(m.productName, { name: form.name }),
                description: fmt(m.productDescription, { plan: quote.plan.label, date: formatDay(parisToIso(form.date, form.startTime)) }),
              },
            },
          },
        ],
        customer_email: form.organizer.email,
        client_reference_id: payment.id,
        metadata,
        payment_intent_data: { receipt_email: form.organizer.email, metadata, description: form.name },
        invoice_creation: { enabled: true, invoice_data: { metadata, description: form.name } },
        locale: "fr",
        success_url: `${site}${paymentResultPath(tournament.id, payment.id)}`,
        cancel_url: `${site}${checkoutCancelPath(tournament.id)}`,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
      },
      { idempotencyKey: `checkout-${payment.id}` },
    );
    if (!session.url) throw new Error("Stripe returned a session without URL");
    const { error: updateError } = await admin
      .from("payments")
      .update({
        stripe_checkout_session_id: session.id,
        checkout_url: session.url,
        expires_at: new Date(session.expires_at * 1000).toISOString(),
      })
      .eq("id", payment.id);
    if (updateError) {
      // Without the session id the webhook could not match the payment: do not let anyone pay.
      await getStripe().checkout.sessions.expire(session.id).catch(() => undefined);
      throw updateError;
    }
    return { kind: "redirect", url: session.url };
  } catch (e) {
    console.error(`[checkout] Stripe session for payment ${payment.id} failed`, e);
    await admin.from("payments").update({ status: "failed" }).eq("id", payment.id).eq("status", "pending");
    return fail("provider_error");
  }
}
