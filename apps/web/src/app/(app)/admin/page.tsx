import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fmt, getMessages } from "@/i18n";
import { Note, Section, Skeleton } from "@/components/ui/Section";
import { formatCount, formatEuros } from "@/lib/format";
import { getAdminOverview, requireAdmin } from "@/lib/data/admin";

const t = getMessages().admin;

// Per-user area: a non-admin gets notFound() from inside the layout's Suspense,
// which the dev-time instant validation would report as an error.
export const instant = false;
export const metadata: Metadata = { title: t.nav.overview };

function Stat({ value, label, sub, href }: { value: string; label: string; sub?: string; href: string }) {
  return (
    <li>
      <Link
        href={href}
        className="grid h-full content-start gap-1 rounded-[var(--radius-lg)] border border-line bg-surface p-4 transition hover:border-ink-soft"
      >
        <span className="display text-5xl tabular">{value}</span>
        <span className="font-bold">{label}</span>
        {sub && <span className="text-sm text-ink-soft">{sub}</span>}
      </Link>
    </li>
  );
}

async function Overview() {
  await requireAdmin();
  const o = await getAdminOverview();
  const n = (v: number) => formatCount(v);
  return (
    <div className="grid gap-8">
      <Section title={t.overview.tournaments} id="admin-tournaments">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat value={n(o.tournaments.upcoming)} label={t.overview.upcoming} sub={t.overview.upcomingSub} href="/admin/concours?statut=upcoming" />
          <Stat value={n(o.tournaments.live)} label={t.overview.live} href="/admin/concours?statut=live" />
          <Stat value={n(o.tournaments.finished)} label={t.overview.finished} href="/admin/concours?statut=finished" />
          <Stat value={n(o.tournaments.drafts)} label={t.overview.drafts} sub={t.overview.draftsSub} href="/admin/concours?statut=draft" />
        </ul>
      </Section>
      <Section title={t.overview.money} id="admin-money">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat value={n(o.payments.paidThisMonth)} label={t.overview.paidThisMonth} href="/admin/paiements?statut=paid" />
          <Stat value={formatEuros(o.payments.totalCentsThisMonth)} label={t.overview.totalThisMonth} sub={t.overview.totalSub} href="/admin/paiements?statut=paid" />
          <Stat value={n(o.payments.pending)} label={t.overview.pending} sub={t.overview.pendingSub} href="/admin/paiements?statut=pending" />
          <Stat value={n(o.activePromos)} label={t.overview.activePromos} href="/admin/codes-promo" />
        </ul>
        {o.payments.testThisMonth > 0 && <Note>{fmt(t.overview.testNote, { count: o.payments.testThisMonth })}</Note>}
      </Section>
    </div>
  );
}

export default function AdminHomePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Overview />
    </Suspense>
  );
}
