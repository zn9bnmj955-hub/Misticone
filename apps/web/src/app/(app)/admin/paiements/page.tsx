import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Note, Skeleton } from "@/components/ui/Section";
import { StatusFilter } from "@/components/admin/StatusFilter";
import { PAYMENT_TONES, formatDateTime } from "@/components/admin/display";
import { formatEuros } from "@/lib/format";
import { LIST_LIMIT, PAYMENT_STATUSES, listPayments, pickStatus, requireAdmin, type AdminPayment } from "@/lib/data/admin";

const m = getMessages();
const t = m.admin.payments;

// Per-user area: a non-admin gets notFound() from inside the layout's Suspense,
// which the dev-time instant validation would report as an error.
export const instant = false;
export const metadata: Metadata = { title: t.title };

type Search = Promise<{ statut?: string | string[] }>;

function PaymentItem({ p }: { p: AdminPayment }) {
  const tournament = p.tournaments;
  const promo = p.promo_codes?.code ?? p.promo_code;
  const discount = formatEuros(p.discount_cents);
  return (
    <Card className="grid gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0">
          <span className="truncate font-bold">{tournament?.name ?? "—"}</span>
          <span className="text-sm text-ink-soft">
            {[p.clubs?.name, p.pricing_plans?.label].filter(Boolean).join(" · ")}
          </span>
        </div>
        <span className="display text-4xl tabular">{formatEuros(p.amount_cents)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={PAYMENT_TONES[p.status]}>{t.statuses[p.status]}</Badge>
        <Badge>{t.providers[p.provider]}</Badge>
      </div>
      <p className="text-sm text-ink-soft tabular">
        {p.discount_cents > 0 ? (promo ? fmt(t.discountWithCode, { amount: discount, code: promo }) : fmt(t.discount, { amount: discount })) : t.noDiscount}
        {" · "}
        {fmt(t.created, { date: formatDateTime(p.created_at) })}
        {p.paid_at && ` · ${fmt(t.paid, { date: formatDateTime(p.paid_at) })}`}
      </p>
      {(p.receipt_url || p.invoice_url || (tournament?.short_code && tournament.status !== "draft")) && (
        <p className="flex flex-wrap gap-x-4 text-sm font-bold">
          {p.receipt_url && (
            <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center text-accent-ink underline">
              {t.receipt}
            </a>
          )}
          {p.invoice_url && (
            <a href={p.invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center text-accent-ink underline">
              {t.invoice}
            </a>
          )}
          {tournament?.short_code && tournament.status !== "draft" && (
            <Link href={`/c/${tournament.short_code}`} className="inline-flex min-h-12 items-center text-accent-ink underline">
              {m.admin.tournaments.publicPage}
            </Link>
          )}
        </p>
      )}
    </Card>
  );
}

async function Payments({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const status = pickStatus((await searchParams).statut, PAYMENT_STATUSES);
  const payments = await listPayments(status);
  return (
    <div className="grid gap-4">
      <StatusFilter basePath="/admin/paiements" current={status} options={PAYMENT_STATUSES.map((s) => ({ value: s, label: t.filters[s] }))} />
      {payments.length === 0 ? (
        <p className="text-ink-soft">{t.none}</p>
      ) : (
        <ul className="grid gap-3">
          {payments.map((p) => (
            <li key={p.id}>
              <PaymentItem p={p} />
            </li>
          ))}
        </ul>
      )}
      {payments.length >= LIST_LIMIT && <Note>{fmt(m.admin.limitNote, { count: LIST_LIMIT })}</Note>}
    </div>
  );
}

export default function AdminPaymentsPage({ searchParams }: { searchParams: Search }) {
  return (
    <div className="grid gap-4">
      <h2 className="display text-3xl">{t.title}</h2>
      <p className="text-ink-soft">{t.intro}</p>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Payments searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
