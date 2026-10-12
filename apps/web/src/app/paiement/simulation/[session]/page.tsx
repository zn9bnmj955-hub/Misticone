import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Section";
import { formatEuros, formatTime } from "@/lib/format";
import { simulationAllowed } from "@/lib/payments/provider";
import { findSimulatedPayment, isOpen } from "@/lib/payments/simulation";
import { paymentResultPath, summaryPath } from "@/lib/payments/urls";
import { cancelSimulated, paySimulated } from "./actions";

export const metadata: Metadata = { title: getMessages().payment.simulation.title, robots: { index: false } };

type Params = Promise<{ session: string }>;
type Search = Promise<{ erreur?: string }>;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={strong ? "display text-3xl tabular" : "text-right font-bold tabular"}>{value}</dd>
    </div>
  );
}

async function Checkout({ params, searchParams }: { params: Params; searchParams: Search }) {
  await connection();
  // Development only: in production this page does not exist.
  if (!simulationAllowed()) notFound();
  const m = getMessages().payment.simulation;
  const [{ session }, { erreur }] = await Promise.all([params, searchParams]);
  const payment = await findSimulatedPayment(session);
  if (!payment) notFound();

  const snapshot = payment.form_snapshot as { name?: unknown } | null;
  const name = typeof snapshot?.name === "string" && snapshot.name ? snapshot.name : (payment.tournaments?.name ?? "");
  const banner = (
    <p role="note" className="flex items-center gap-3 rounded-[var(--radius)] border-2 border-dashed border-warning bg-warning/15 px-4 py-3 font-bold text-warning">
      <Icon name="sparkle" size={20} />
      {m.testBanner}
    </p>
  );

  if (!isOpen(payment)) {
    const paid = payment.status === "paid";
    return (
      <div className="grid gap-5">
        {banner}
        <Card className="grid gap-3 p-6">
          <h1 className="display text-4xl">{m.unavailableTitle}</h1>
          <p className="text-ink-soft">{paid ? m.paidText : m.unavailableText}</p>
          <ButtonLink href={paid ? paymentResultPath(payment.tournament_id, payment.id) : summaryPath(payment.tournament_id)} className="justify-self-start">
            {paid ? m.seeResult : m.backToForm}
          </ButtonLink>
        </Card>
      </div>
    );
  }

  const base = payment.amount_cents + payment.discount_cents;
  const amount = formatEuros(payment.amount_cents);
  return (
    <div className="grid gap-5">
      {banner}
      <Card className="grid gap-5 p-6">
        <div className="grid gap-1">
          <p className="eyebrow">{m.tournament}</p>
          <h1 className="display text-4xl">{name}</h1>
        </div>
        <dl className="grid">
          {payment.pricing_plans?.label && <Row label={m.plan} value={payment.pricing_plans.label} />}
          {payment.discount_cents > 0 && (
            <>
              <Row label={m.price} value={formatEuros(base)} />
              <Row
                label={payment.promo_code ? fmt(m.discountCode, { code: payment.promo_code }) : m.discount}
                value={`− ${formatEuros(payment.discount_cents)}`}
              />
            </>
          )}
          <Row label={m.total} value={amount} strong />
        </dl>
        {payment.customer_email && (
          <p className="text-sm text-ink-soft">
            {m.email} <strong className="text-ink">{payment.customer_email}</strong>
          </p>
        )}
        {erreur && Object.hasOwn(m.errors, erreur) && (
          <p role="alert" className="rounded-[var(--radius)] bg-danger/10 px-4 py-3 text-sm font-bold text-danger">
            {m.errors[erreur]}
          </p>
        )}
        <form action={paySimulated} className="grid">
          <input type="hidden" name="session" value={session} />
          <Button type="submit" size="lg">
            <Icon name="check" size={22} />
            {fmt(m.pay, { amount })}
          </Button>
        </form>
        <form action={cancelSimulated} className="grid">
          <input type="hidden" name="session" value={session} />
          <Button type="submit" variant="ghost">
            {m.cancel}
          </Button>
        </form>
        {payment.expires_at && <p className="text-center text-sm text-ink-soft">{fmt(m.expiresAt, { time: formatTime(payment.expires_at) })}</p>}
      </Card>
      <p className="text-center text-sm text-ink-soft">{m.testText}</p>
    </div>
  );
}

/** Stand-in for the Stripe hosted payment page, for local development. */
export default function SimulatedCheckoutPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <main id="contenu" className="mx-auto grid min-h-dvh w-full max-w-md content-start gap-6 px-4 py-8">
      <Link href="/" className="justify-self-start text-sm font-bold text-ink-soft underline">
        {getMessages().meta.title}
      </Link>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Checkout params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
