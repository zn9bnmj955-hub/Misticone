import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSport } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import type { Tables } from "@orgasport/db";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink, buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Note, Skeleton } from "@/components/ui/Section";
import { env } from "@/lib/env";
import { formatDay, formatEuros, formatTime } from "@/lib/format";
import { paymentResultPath, summaryPath, UUID_RE } from "@/lib/payments/urls";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { PaymentWatcher } from "./PaymentWatcher";
import { ShareActions } from "./ShareActions";

export const metadata: Metadata = { title: getMessages().payment.result.title, robots: { index: false } };

type Params = Promise<{ id: string }>;
type Search = Promise<{ p?: string }>;

const PAYMENT_COLUMNS = "id, status, provider, amount_cents, discount_cents, promo_code, customer_email, form_snapshot, receipt_url, invoice_url, paid_at";
type PaymentRow = Pick<
  Tables<"payments">,
  "id" | "status" | "provider" | "amount_cents" | "discount_cents" | "promo_code" | "customer_email" | "form_snapshot" | "receipt_url" | "invoice_url" | "paid_at"
>;
type TournamentRow = Pick<Tables<"tournaments">, "id" | "name" | "status" | "short_code" | "sport_slug" | "starts_at">;

/** What the organizer asked for in the form (PINs, co-organizers), read from the paid snapshot. */
function snapshotInfo(payment: PaymentRow | null) {
  const s = (payment?.form_snapshot ?? {}) as { pinCount?: unknown; coOrganizers?: unknown };
  return {
    pinCount: typeof s.pinCount === "number" ? s.pinCount : 0,
    coOrganizers: Array.isArray(s.coOrganizers) ? s.coOrganizers.length : 0,
  };
}

function Online({ tournament: t, payment }: { tournament: TournamentRow; payment: PaymentRow | null }) {
  const m = getMessages().payment;
  const r = m.result;
  const code = t.short_code ?? "";
  const url = `${env.siteUrl.replace(/\/$/, "")}/c/${code}`;
  const when = t.starts_at ? `${formatDay(t.starts_at)} · ${formatTime(t.starts_at)}` : "";
  const { pinCount, coOrganizers } = snapshotInfo(payment);
  return (
    <div className="grid gap-6" data-sport={getSport(t.sport_slug)?.accentToken}>
      <div className="grid gap-2">
        <p className="eyebrow flex items-center gap-2 text-accent-ink">
          <Icon name="check" size={18} />
          {t.name}
        </p>
        <h1 className="display text-5xl">{r.onlineTitle}</h1>
        <p className="text-lg text-ink-soft">{fmt(r.onlineText, { name: t.name })}</p>
      </div>

      <Card className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="grid min-w-0 gap-3">
          <p className="text-sm font-bold">{r.shortLink}</p>
          <p className="display text-5xl tracking-wider text-accent-ink tabular">{code}</p>
          <ShareActions url={url} title={t.name} text={fmt(r.shareText, { name: t.name, date: when, url })} />
        </div>
        <figure className="grid justify-items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG served by our own route */}
          <img src={`/c/${code}/qr.svg`} alt={fmt(r.qrAlt, { code })} width={176} height={176} className="size-44 rounded-[var(--radius)]" />
          <figcaption className="max-w-48 text-center text-xs text-ink-soft">{r.qrHint}</figcaption>
        </figure>
      </Card>

      {/* Terrain pages are plain HTML routes: regular links, no client navigation. */}
      <div className="grid gap-2 sm:grid-cols-3">
        <a href={`/c/${code}`} className={buttonClass("primary")}>
          {r.publicPage}
        </a>
        <a href={`/c/${code}/affiche`} className={buttonClass("outline")}>
          {r.poster}
        </a>
        <a href={`/c/${code}/table`} className={buttonClass("outline")}>
          {r.scoringTable}
        </a>
      </div>

      {payment?.customer_email && (
        <Note>
          <span className="flex items-start gap-2">
            <Icon name="mail" size={18} className="mt-0.5 shrink-0" />
            <span>
              {fmt(pinCount > 0 ? r.pinsSent : r.summarySent, { email: payment.customer_email })}
              {coOrganizers > 0 && <> {r.coOrganizersSent}</>}
            </span>
          </span>
        </Note>
      )}

      {payment && (
        <section aria-label={r.receiptTitle} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft">
          <span className="tabular">
            {payment.amount_cents > 0
              ? fmt(r.paidOn, { amount: formatEuros(payment.amount_cents), date: formatDay(payment.paid_at) })
              : fmt(r.freeOn, { date: formatDay(payment.paid_at) })}
          </span>
          {payment.provider === "simulation" && <Badge tone="warning">{r.testPayment}</Badge>}
          {payment.receipt_url && (
            <a href={payment.receipt_url} target="_blank" rel="noopener noreferrer" className="font-bold text-ink underline">
              {r.receipt}
            </a>
          )}
          {payment.invoice_url && (
            <a href={payment.invoice_url} target="_blank" rel="noopener noreferrer" className="font-bold text-ink underline">
              {r.invoice}
            </a>
          )}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/club/concours/${t.id}`} variant="outline">
          {r.manage}
        </ButtonLink>
        <ButtonLink href="/club" variant="ghost">
          {r.backToClub}
        </ButtonLink>
      </div>
    </div>
  );
}

function Pending({ paymentId, tournament }: { paymentId: string; tournament: TournamentRow }) {
  const r = getMessages().payment.result;
  return (
    <Card className="grid gap-4 p-6" aria-live="polite" data-sport={getSport(tournament.sport_slug)?.accentToken}>
      <p className="flex items-center gap-3">
        <span className="live-dot bg-accent" aria-hidden="true" />
        <span className="eyebrow">{tournament.name}</span>
      </p>
      <h1 className="display text-4xl">{r.pendingTitle}</h1>
      <p className="text-ink-soft">{r.pendingText}</p>
      <PaymentWatcher paymentId={paymentId} />
      <a href={paymentResultPath(tournament.id, paymentId)} className="justify-self-start text-sm font-bold text-ink underline">
        {r.refresh}
      </a>
    </Card>
  );
}

function NotPaid({ status, tournamentId }: { status: PaymentRow["status"]; tournamentId: string }) {
  const r = getMessages().payment.result;
  const [title, text] =
    status === "failed" ? [r.failedTitle, r.failedText] : status === "refunded" ? [r.refundedTitle, r.refundedText] : [r.expiredTitle, r.expiredText];
  return (
    <Card className="grid gap-4 p-6">
      <h1 className="display text-4xl">{title}</h1>
      <p className="text-ink-soft">{text}</p>
      <ButtonLink href={summaryPath(tournamentId)} className="justify-self-start">
        {r.retry}
      </ButtonLink>
    </Card>
  );
}

async function Result({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id }, { p }] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(id)) notFound();
  const paymentId = p && UUID_RE.test(p) ? p : null;
  const viewer = await getViewer();
  if (!viewer) redirect(`/connexion?next=${encodeURIComponent(paymentResultPath(id, paymentId ?? undefined))}`);

  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status, short_code, sport_slug, starts_at, club_id")
    .eq("id", id)
    .maybeSingle();
  // Published tournaments are public: membership is checked explicitly.
  if (!tournament || !(viewer.isAdmin || viewer.clubs.some((c) => c.id === tournament.club_id))) notFound();

  if (tournament.status !== "draft") {
    const { data: paid } = await supabase
      .from("payments")
      .select(PAYMENT_COLUMNS)
      .eq("tournament_id", id)
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return <Online tournament={tournament} payment={paid} />;
  }

  const query = supabase.from("payments").select(PAYMENT_COLUMNS).eq("tournament_id", id);
  const { data: payment } = await (paymentId ? query.eq("id", paymentId) : query.order("created_at", { ascending: false }).limit(1)).maybeSingle();
  if (!payment) redirect(summaryPath(id));
  // "paid" with a draft only lasts the instant of the publication transaction.
  if (payment.status === "pending" || payment.status === "paid") return <Pending paymentId={payment.id} tournament={tournament} />;
  return <NotPaid status={payment.status} tournamentId={id} />;
}

/** Where Stripe (or the simulation) sends the organizer back after paying. */
export default function PaymentResultPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Result params={params} searchParams={searchParams} />
    </Suspense>
  );
}
