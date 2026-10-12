import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getSport } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Note, Skeleton } from "@/components/ui/Section";
import { StatusFilter } from "@/components/admin/StatusFilter";
import { PAYMENT_TONES, TOURNAMENT_TONES, formatDateTime } from "@/components/admin/display";
import {
  LIST_LIMIT,
  TOURNAMENT_FILTERS,
  listAdminTournaments,
  pickStatus,
  requireAdmin,
  type AdminTournament,
  type TournamentFilter,
} from "@/lib/data/admin";

const m = getMessages();
const t = m.admin.tournaments;

// Per-user area: a non-admin gets notFound() from inside the layout's Suspense,
// which the dev-time instant validation would report as an error.
export const instant = false;
export const metadata: Metadata = { title: t.title };

type Search = Promise<{ statut?: string | string[] }>;

function filterLabel(f: TournamentFilter): string {
  return f === "upcoming" ? t.upcoming : m.status[f];
}

function TournamentItem({ tournament: tr }: { tournament: AdminTournament }) {
  const sport = getSport(tr.sport_slug);
  const payment = tr.payment;
  // A draft has no public page yet (the link would be a 404).
  const online = tr.short_code && tr.status !== "draft";
  return (
    <Card className="grid gap-2" data-sport={sport?.accentToken}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0">
          <span className="font-bold">{tr.name}</span>
          <span className="text-sm text-ink-soft">{tr.clubs?.name ?? "—"}</span>
        </div>
        {tr.short_code && <span className="display text-3xl tabular">{tr.short_code}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TOURNAMENT_TONES[tr.status]}>{m.status[tr.status]}</Badge>
        <Badge tone="accent">
          {sport && <Icon name={sport.icon} size={14} />}
          {sport?.name ?? tr.sport_slug}
        </Badge>
        {payment ? (
          <Badge tone={PAYMENT_TONES[payment.status]}>
            {fmt(t.payment, { status: m.admin.payments.statuses[payment.status] })}
            {payment.provider !== "stripe" && ` · ${m.admin.payments.providers[payment.provider]}`}
          </Badge>
        ) : (
          <Badge>{t.noPayment}</Badge>
        )}
      </div>
      <p className="text-sm text-ink-soft tabular">{tr.starts_at ? fmt(t.starts, { date: formatDateTime(tr.starts_at) }) : t.noDate}</p>
      {online ? (
        <Link href={`/c/${tr.short_code}`} className="inline-flex min-h-12 items-center justify-self-start text-sm font-bold text-accent-ink underline">
          {t.publicPage}
        </Link>
      ) : (
        <p className="text-sm text-ink-soft">{t.notOnline}</p>
      )}
    </Card>
  );
}

async function Tournaments({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const filter = pickStatus((await searchParams).statut, TOURNAMENT_FILTERS);
  const tournaments = await listAdminTournaments(filter);
  return (
    <div className="grid gap-4">
      <StatusFilter basePath="/admin/concours" current={filter} options={TOURNAMENT_FILTERS.map((f) => ({ value: f, label: filterLabel(f) }))} />
      {tournaments.length === 0 ? (
        <p className="text-ink-soft">{m.admin.empty}</p>
      ) : (
        <ul className="grid gap-3">
          {tournaments.map((tr) => (
            <li key={tr.id}>
              <TournamentItem tournament={tr} />
            </li>
          ))}
        </ul>
      )}
      {tournaments.length >= LIST_LIMIT && <Note>{fmt(m.admin.limitNote, { count: LIST_LIMIT })}</Note>}
    </div>
  );
}

export default function AdminTournamentsPage({ searchParams }: { searchParams: Search }) {
  return (
    <div className="grid gap-4">
      <h2 className="display text-3xl">{t.title}</h2>
      <p className="text-ink-soft">{t.intro}</p>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Tournaments searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
