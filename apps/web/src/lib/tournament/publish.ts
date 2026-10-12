import "server-only";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { getSport } from "@orgasport/sports";
import type { Json } from "@orgasport/db";
import { fmt, getMessages } from "@/i18n";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { coOrganizerEmail, organizerEmail, type PublishedTournament } from "@/lib/payments/emails";
import { generatePins } from "@/lib/payments/pins";
import { getStripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPublication, formSchema, type TournamentForm } from "@/lib/tournament-form";

/**
 * Fulfillment: turns a confirmed payment into a published tournament.
 * Called by the Stripe webhook (signed event), by the free path (100 %
 * promo code) and by the local payment simulation through that same webhook.
 * Never called from a browser return.
 *
 * What gets published is the form frozen on the payment row when the
 * checkout started (form_snapshot): exactly what the club paid for.
 * Idempotent: publish_tournament() locks the payment and the tournament, so a
 * second call (Stripe retries, two deliveries at once) returns
 * "already_published" and sends nothing.
 */
export type FulfillResult = {
  status: "published" | "already_published" | "refunded";
  tournamentId: string;
  shortCode: string | null;
};

export class FulfillmentError extends Error {
  constructor(readonly code: "payment_not_found" | "tournament_not_found" | "invalid_snapshot" | "unknown_sport") {
    super(`fulfillment failed: ${code}`);
  }
}

const PAYMENT_COLUMNS =
  "id, status, provider, tournament_id, club_id, created_by, form_snapshot, amount_cents, discount_cents, currency, promo_code, stripe_checkout_session_id, stripe_payment_intent_id, customer_email, receipt_url, invoice_url, paid_at";

/** Runs after the response when possible (route handlers, server actions), inline otherwise. */
function afterResponse(task: () => Promise<void>) {
  const run = () => task().catch((e: unknown) => console.error("[publish] post-publication tasks failed", e));
  try {
    after(run);
  } catch {
    void run();
  }
}

function invalidateCaches(clubSlug: string | null) {
  try {
    revalidateTag("tournaments", { expire: 0 });
    revalidateTag("stats", { expire: 0 });
    if (clubSlug) revalidateTag(`club:${clubSlug}`, { expire: 0 });
  } catch (e) {
    // Outside a request (scripts): caches simply expire on their own.
    console.warn("[publish] cache revalidation skipped", e);
  }
}

export async function fulfillPayment(paymentId: string, extra: { paymentIntentId?: string | null } = {}): Promise<FulfillResult> {
  const admin = createAdminClient();
  const { data: payment, error } = await admin.from("payments").select(PAYMENT_COLUMNS).eq("id", paymentId).maybeSingle();
  if (error) throw error;
  if (!payment) throw new FulfillmentError("payment_not_found");
  const { data: tournament, error: tError } = await admin
    .from("tournaments")
    .select("id, status, short_code, clubs (slug)")
    .eq("id", payment.tournament_id)
    .maybeSingle();
  if (tError) throw tError;
  if (!tournament) throw new FulfillmentError("tournament_not_found");
  const done = { tournamentId: tournament.id, shortCode: tournament.short_code };

  if (payment.status === "paid" && tournament.status !== "draft") return { status: "already_published", ...done };
  if (payment.status === "refunded") {
    console.error(`[publish] payment ${payment.id} was refunded: not publishing`);
    return { status: "refunded", ...done };
  }

  const parsed = formSchema.safeParse(payment.form_snapshot);
  if (!parsed.success) throw new FulfillmentError("invalid_snapshot");
  const form = parsed.data;
  const sport = getSport(form.sportSlug);
  if (!sport) throw new FulfillmentError("unknown_sport");

  const m = getMessages().payment;
  const pins = generatePins(form.pinCount);
  const publication = buildPublication(form, sport, {
    organizerUserId: payment.created_by,
    pins,
    pinLabel: (n) => fmt(m.pinLabel, { n }),
  });
  const { data: result, error: rpcError } = await admin.rpc("publish_tournament", {
    p_payment: payment.id,
    p_fields: publication.fields as Json,
    p_venues: publication.venues as Json,
    p_staff: publication.staff as unknown as Json,
  });
  if (rpcError) throw rpcError;

  // Keep Stripe's reference whatever happened: it is what a refund needs.
  if (extra.paymentIntentId && extra.paymentIntentId !== payment.stripe_payment_intent_id) {
    const { error: piError } = await admin.from("payments").update({ stripe_payment_intent_id: extra.paymentIntentId }).eq("id", payment.id);
    if (piError) console.warn("[publish] could not store the payment intent", piError);
  }

  if (result !== "published") {
    if (payment.status !== "paid") {
      // Paid twice (an old checkout tab completed after another one): the
      // tournament is already online, this second payment must be refunded.
      console.error(`[publish] payment ${payment.id} confirmed for tournament ${tournament.id} which was already published: refund needed`);
    }
    return { status: "already_published", ...done };
  }

  invalidateCaches(tournament.clubs?.slug ?? null);
  const pinItems = pins.map((pin, i) => ({ label: fmt(m.pinLabel, { n: i + 1 }), pin }));
  afterResponse(() =>
    notifyPublication({
      paymentId: payment.id,
      provider: payment.provider,
      sessionId: payment.stripe_checkout_session_id,
      paymentIntentId: extra.paymentIntentId ?? payment.stripe_payment_intent_id,
      tournamentId: tournament.id,
      code: tournament.short_code ?? "",
      startsAt: String(publication.fields.starts_at),
      form,
      pins: pinItems,
    }),
  );
  return { status: "published", ...done };
}

/** Stripe's receipt and invoice links (best effort: the emails go out anyway). */
async function stripeDocuments(sessionId: string) {
  const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["invoice", "payment_intent.latest_charge"] });
  const invoice = session.invoice && typeof session.invoice === "object" ? session.invoice : null;
  const pi = session.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent : null;
  const charge = pi?.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  return {
    receiptUrl: charge?.receipt_url ?? null,
    invoiceUrl: invoice?.hosted_invoice_url ?? invoice?.invoice_pdf ?? null,
    paymentIntentId: pi?.id ?? (typeof session.payment_intent === "string" ? session.payment_intent : null),
  };
}

async function notifyPublication(p: {
  paymentId: string;
  provider: "stripe" | "simulation" | "free";
  sessionId: string | null;
  paymentIntentId: string | null;
  tournamentId: string;
  code: string;
  startsAt: string;
  form: TournamentForm;
  pins: { label: string; pin: string }[];
}) {
  const admin = createAdminClient();
  let paymentIntentId = p.paymentIntentId;
  if (p.provider === "stripe" && p.sessionId) {
    try {
      const docs = await stripeDocuments(p.sessionId);
      paymentIntentId = docs.paymentIntentId ?? paymentIntentId;
      await admin
        .from("payments")
        .update({ receipt_url: docs.receiptUrl, invoice_url: docs.invoiceUrl, stripe_payment_intent_id: paymentIntentId })
        .eq("id", p.paymentId);
    } catch (e) {
      console.warn("[publish] Stripe receipt not available", e);
    }
  }
  const { data: payment } = await admin
    .from("payments")
    .select("amount_cents, discount_cents, promo_code, customer_email, paid_at, receipt_url, invoice_url")
    .eq("id", p.paymentId)
    .single();

  const info: PublishedTournament = {
    tournamentId: p.tournamentId,
    name: p.form.name,
    code: p.code,
    startsAt: p.startsAt,
    address: p.form.address,
    postcode: p.form.postcode,
    city: p.form.city,
    organizer: { name: p.form.organizer.name, email: payment?.customer_email || p.form.organizer.email },
    coOrganizers: p.form.coOrganizers,
    pins: p.pins,
    receipt: {
      provider: p.provider,
      baseCents: (payment?.amount_cents ?? 0) + (payment?.discount_cents ?? 0),
      discountCents: payment?.discount_cents ?? 0,
      amountCents: payment?.amount_cents ?? 0,
      promoCode: payment?.promo_code ?? null,
      paidAt: payment?.paid_at ?? new Date().toISOString(),
      reference: paymentIntentId ?? p.paymentId,
      receiptUrl: payment?.receipt_url ?? null,
      invoiceUrl: payment?.invoice_url ?? null,
    },
    siteUrl: env.siteUrl,
  };
  const results = await Promise.all([
    sendEmail(organizerEmail(info)),
    ...info.coOrganizers.map((email) => sendEmail(coOrganizerEmail(info, email))),
  ]);
  const failed = results.filter((r) => !r.ok).length;
  if (failed > 0) console.error(`[publish] ${failed} publication email(s) for tournament ${p.tournamentId} were not delivered`);
}
