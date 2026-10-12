"use server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { simulationAllowed } from "@/lib/payments/provider";
import { deliverSimulatedEvent, findSimulatedPayment, isOpen, simulatedEventFor } from "@/lib/payments/simulation";
import { checkoutCancelPath, paymentResultPath, simulationPath } from "@/lib/payments/urls";

/**
 * Buttons of the simulated hosted payment page. Like Stripe's page, it needs
 * no account: the unguessable session id is the capability. The tournament
 * is published only by the webhook receiving the signed event.
 */
async function openPayment(formData: FormData) {
  if (!simulationAllowed()) redirect("/");
  const session = String(formData.get("session") ?? "");
  const payment = await findSimulatedPayment(session);
  if (!payment) redirect("/");
  return { session, payment };
}

export async function paySimulated(formData: FormData): Promise<void> {
  const { session, payment } = await openPayment(formData);
  if (!isOpen(payment)) redirect(`${simulationPath(session)}?erreur=expired`);
  const delivered = await deliverSimulatedEvent(simulatedEventFor("checkout.session.completed", payment));
  if (!delivered) redirect(`${simulationPath(session)}?erreur=webhook`);
  redirect(paymentResultPath(payment.tournament_id, payment.id));
}

export async function cancelSimulated(formData: FormData): Promise<void> {
  const { payment } = await openPayment(formData);
  if (payment.status === "pending") {
    // Stripe would only expire the session later; we close it right away.
    const delivered = await deliverSimulatedEvent(simulatedEventFor("checkout.session.expired", payment));
    if (!delivered) {
      await createAdminClient().from("payments").update({ status: "expired" }).eq("id", payment.id).eq("status", "pending");
    }
  }
  redirect(checkoutCancelPath(payment.tournament_id));
}
