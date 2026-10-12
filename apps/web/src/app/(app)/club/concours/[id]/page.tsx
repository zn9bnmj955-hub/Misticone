import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSport } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Note, Section, Skeleton } from "@/components/ui/Section";
import { NoClub } from "@/components/club/NoClub";
import { countTeams, formatLongDate } from "@/components/club/model";
import { getManagedTournament, listManagedRegistrations, listTournamentPayments, listTournamentStaff } from "@/lib/data/clubs";
import { formatDay, formatEuros, formatTime } from "@/lib/format";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: getMessages().clubSpace.manage.registrations.title, robots: { index: false } };

/** Private per-tournament page: the id is only known at request time (see the draft editor). */
export const instant = false;

type Params = Promise<{ id: string }>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Manage({ params }: { params: Params }) {
  const m = getMessages();
  const t = m.clubSpace.manage;
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) return <NoClub viewer={null} next={`/club/concours/${id}`} />;
  if (!UUID_RE.test(id)) notFound();

  // RLS: club members and the tournament's organizers only.
  const tournament = await getManagedTournament(id);
  if (!tournament) notFound();
  if (tournament.status === "draft") redirect(`/club/concours/${id}/modifier`);
  const role = viewer.clubs.find((c) => c.id === tournament.club_id)?.role;

  const [teams, staff, payments] = await Promise.all([listManagedRegistrations(id), listTournamentStaff(id), listTournamentPayments(id)]);
  const counts = countTeams(teams);
  const sport = getSport(tournament.sport_slug);
  const code = tournament.short_code;
  const r = t.registrations;
  const paid = payments.find((p) => p.status === "paid") ?? null;
  // Players and contacts come back only for managers (RLS); say why the list is shorter otherwise.
  const seesPlayers = viewer.isAdmin || role === "owner" || role === "admin" || staff.some((s) => s.user_id === viewer.id && !s.revoked_at);
  const place = [tournament.address, [tournament.postcode, tournament.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return (
    <div className="grid gap-8" data-sport={sport?.accentToken}>
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tournament.status === "live" ? "live" : tournament.status === "published" ? "accent" : "neutral"}>{m.status[tournament.status]}</Badge>
          <span className="text-sm font-bold tabular text-ink-soft">{code}</span>
        </div>
        <h1 className="display text-5xl">{tournament.name}</h1>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-soft">
          {tournament.starts_at && (
            <span className="inline-flex items-center gap-1.5 tabular">
              <Icon name="calendar" size={18} />
              {fmt(t.when, { day: formatDay(tournament.starts_at), time: formatTime(tournament.starts_at) })}
            </span>
          )}
          {place && (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="mapPin" size={18} />
              {place}
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={`/c/${code}`} className={buttonClass("primary")}>
            <Icon name="live" size={20} />
            {t.links.public}
          </a>
          <a href={`/c/${code}/table`} className={buttonClass("inverse")}>
            <Icon name="target" size={20} />
            {t.links.table}
          </a>
          <a href={`/c/${code}/qr.svg`} className={buttonClass("outline")}>
            <Icon name="qr" size={20} />
            {t.links.qr}
          </a>
          <a href={`/c/${code}/affiche`} className={buttonClass("outline")}>
            <Icon name="image" size={20} />
            {t.links.poster}
          </a>
        </div>
      </header>

      <Section title={r.title}>
        <p className="font-semibold tabular">
          {tournament.max_teams ? fmt(r.summaryMax, { count: counts.active, max: tournament.max_teams }) : fmt(r.summary, { count: counts.active })}
          {counts.waitlist > 0 && <span className="font-normal text-ink-soft"> · {fmt(r.waitlist, { count: counts.waitlist })}</span>}
        </p>
        <Note>{seesPlayers ? r.private : r.hidden}</Note>
        {teams.length === 0 ? (
          <p className="text-ink-soft">{r.empty}</p>
        ) : (
          <ul className="grid gap-3">
            {teams.map((team) => {
              const reg = team.registrations;
              const players = [...team.players].sort((a, b) => Number(a.is_substitute) - Number(b.is_substitute) || (a.position ?? 0) - (b.position ?? 0));
              return (
                <li key={team.id} className="grid gap-2 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-bold">
                      <span className="tabular">{fmt(r.team, { number: team.number })}</span>
                      {team.name && <span> · {team.name}</span>}
                      {team.club_name && <span className="font-normal text-ink-soft"> · {team.club_name}</span>}
                    </p>
                    <Badge tone={team.status === "waitlist" ? "warning" : team.status === "checked_in" ? "success" : "neutral"}>{r.statuses[team.status]}</Badge>
                  </div>
                  {players.length > 0 && (
                    <ul className="flex flex-wrap gap-x-4 gap-y-1">
                      {players.map((p, i) => (
                        <li key={i}>
                          {p.first_name} {p.last_name}
                          {p.is_substitute && <span className="text-sm text-ink-soft"> ({r.substitute})</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {reg && (reg.captain_name || reg.captain_phone || reg.captain_email) && (
                    <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                      <span className="font-bold">{r.captain} :</span>
                      {reg.captain_name && <span>{reg.captain_name}</span>}
                      {reg.captain_phone && (
                        <a href={`tel:${reg.captain_phone.replace(/[^\d+]/g, "")}`} className="underline underline-offset-4 tabular">
                          {reg.captain_phone}
                        </a>
                      )}
                      {reg.captain_email && (
                        <a href={`mailto:${reg.captain_email}`} className="break-all underline underline-offset-4">
                          {reg.captain_email}
                        </a>
                      )}
                    </p>
                  )}
                  {reg && <p className="text-sm text-ink-soft">{fmt(r.registeredOn, { date: formatLongDate(reg.created_at), source: r.sources[reg.source] })}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t.staff.title}>
        {staff.length === 0 ? (
          <p className="text-ink-soft">{t.staff.empty}</p>
        ) : (
          <ul className="grid gap-2">
            {staff.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-line bg-surface p-3">
                <span className="grid min-w-0 gap-0.5">
                  <span className="break-all font-semibold">{s.email ?? s.label ?? t.staff.roles[s.role]}</span>
                  <span className="text-sm text-ink-soft">
                    {t.staff.roles[s.role]}
                    {s.revoked_at
                      ? ` · ${t.staff.revoked}`
                      : !s.user_id && s.email
                        ? ` · ${t.staff.pendingAccount}`
                        : !s.user_id && !s.email
                          ? ` · ${t.staff.pin}`
                          : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {staff.some((s) => !s.user_id && !s.email) && <Note>{t.staff.pinNote}</Note>}
      </Section>

      <Section title={t.payment.title}>
        {paid ? (
          <Card className="grid gap-2">
            <p className="tabular">
              <span className="text-sm text-ink-soft">{t.payment.amount} : </span>
              <span className="text-lg font-bold">{formatEuros(paid.amount_cents)}</span>
              {paid.provider !== "stripe" && <span className="text-sm text-ink-soft"> · {m.clubSpace.invoices.testLabel}</span>}
            </p>
            {paid.paid_at && <p className="text-sm text-ink-soft">{fmt(t.payment.paidOn, { date: formatLongDate(paid.paid_at) })}</p>}
            <div className="flex flex-wrap gap-2">
              {paid.receipt_url && (
                <a href={paid.receipt_url} target="_blank" rel="noopener noreferrer" className={buttonClass("outline")}>
                  {m.clubSpace.invoices.receipt}
                </a>
              )}
              <Link href="/club/factures" className={buttonClass("ghost")}>
                {t.payment.seeAll}
              </Link>
            </div>
          </Card>
        ) : (
          <p className="text-ink-soft">{t.payment.none}</p>
        )}
      </Section>
    </div>
  );
}

export default function ManageTournamentPage({ params }: { params: Params }) {
  const t = getMessages().clubSpace.manage;
  return (
    <div className="grid gap-5">
      <Link href="/club" className="inline-flex min-h-10 items-center gap-1.5 justify-self-start text-sm font-bold text-ink-soft hover:text-ink">
        <Icon name="arrowLeft" size={18} />
        {t.back}
      </Link>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Manage params={params} />
      </Suspense>
    </div>
  );
}
