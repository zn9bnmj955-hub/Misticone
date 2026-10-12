import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Section";
import { ClubPageHeader } from "@/components/club/ClubPageHeader";
import { NoClub } from "@/components/club/NoClub";
import { formatLongDate } from "@/components/club/model";
import { getClubContext, listClubPayments } from "@/lib/data/clubs";
import { formatEuros } from "@/lib/format";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: getMessages().clubSpace.invoices.title, robots: { index: false } };

type Status = "pending" | "paid" | "failed" | "refunded" | "expired";
const TONE: Record<Status, "success" | "warning" | "neutral"> = {
  paid: "success",
  pending: "warning",
  failed: "neutral",
  refunded: "neutral",
  expired: "neutral",
};

/** The club's payments, and whether each pending one can still be resumed (read at request time). */
async function loadInvoices(clubId: string) {
  const payments = await listClubPayments(clubId);
  const now = Date.now();
  return payments.map((p) => ({
    ...p,
    resumable: p.status === "pending" && p.checkout_url !== null && (!p.expires_at || Date.parse(p.expires_at) > now),
  }));
}

async function Invoices() {
  const t = getMessages().clubSpace.invoices;
  const ctx = await getClubContext();
  if (!ctx) return <NoClub viewer={await getViewer()} next="/club/factures" />;
  const payments = await loadInvoices(ctx.club.id);
  if (payments.length === 0) return <p className="text-ink-soft">{t.empty}</p>;

  const totalPaid = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount_cents, 0);

  return (
    <div className="grid gap-4">
      <p className="display text-2xl tabular">{fmt(t.total, { amount: formatEuros(totalPaid) })}</p>
      <ul className="grid gap-3">
        {payments.map((p) => {
          const test = p.provider !== "stripe";
          const discount = p.discount_cents > 0 ? fmt(p.promo_code ? t.discountCode : t.discount, { amount: formatEuros(p.discount_cents), code: p.promo_code ?? "" }) : null;
          return (
            <li key={p.id} className="grid gap-2 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="grid min-w-0 gap-0.5">
                  {p.tournaments ? (
                    <Link href={`/club/concours/${p.tournaments.id}`} className="font-bold underline-offset-4 hover:underline">
                      {p.tournaments.name}
                    </Link>
                  ) : null}
                  <p className="text-sm text-ink-soft">
                    {fmt(t.date, { date: formatLongDate(p.paid_at ?? p.created_at) })}
                    {p.pricing_plans?.label && ` · ${t.plan} « ${p.pricing_plans.label} »`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {test && <Badge tone="accent">{t.testLabel}</Badge>}
                  <Badge tone={TONE[p.status]}>{t.status[p.status]}</Badge>
                </div>
              </div>
              <p className="tabular">
                <span className="text-sm text-ink-soft">{t.amount} : </span>
                <span className="text-lg font-bold">{formatEuros(p.amount_cents)}</span>
                {discount && <span className="text-sm text-ink-soft"> · {discount}</span>}
              </p>
              <p className="text-sm text-ink-soft">{t.provider[p.provider]}</p>
              {(p.receipt_url || p.invoice_url || p.resumable) && (
                <div className="flex flex-wrap gap-2">
                  {p.receipt_url && (
                    <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" className={buttonClass("outline")}>
                      {t.receipt}
                    </a>
                  )}
                  {p.invoice_url && (
                    <a href={p.invoice_url} target="_blank" rel="noopener noreferrer" className={buttonClass("outline")}>
                      {t.invoice}
                    </a>
                  )}
                  {p.resumable && p.checkout_url && (
                    <a href={p.checkout_url} className={buttonClass("primary")}>
                      {t.resume}
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ClubInvoicesPage() {
  const t = getMessages().clubSpace.invoices;
  return (
    <div className="grid gap-6">
      <ClubPageHeader title={t.title} intro={t.intro} />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Invoices />
      </Suspense>
    </div>
  );
}
