import type { Metadata } from "next";
import { Suspense } from "react";
import { getSport } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { Card } from "@/components/ui/Card";
import { Section, Skeleton } from "@/components/ui/Section";
import { ClubPageHeader } from "@/components/club/ClubPageHeader";
import { NoClub } from "@/components/club/NoClub";
import { aggregateClubStats } from "@/components/club/model";
import { getClubContext, loadClubStatsRows } from "@/lib/data/clubs";
import { formatCount, formatEuros } from "@/lib/format";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: getMessages().clubSpace.stats.title, robots: { index: false } };

const monthName = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });
/** "2026-10" → "oct. 26". */
const monthLabel = (key: string) => monthName.format(new Date(`${key}-15T12:00:00Z`));

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="grid content-start gap-1">
      <p className="text-sm font-bold text-ink-soft">{label}</p>
      <p className="display text-4xl tabular">{value}</p>
      {hint && <p className="text-sm text-ink-soft">{hint}</p>}
    </Card>
  );
}

/** Label, proportional bar, value: readable without any chart library, and in both themes (tokens only). */
function BarList({ rows, max }: { rows: { key: string; label: React.ReactNode; value: number; text: string }[]; max: number }) {
  return (
    <ul className="grid gap-2">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(7rem,10rem)_1fr_auto] items-center gap-3">
          <span className="truncate text-sm font-semibold">{r.label}</span>
          <span className="h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${max > 0 ? Math.round((r.value / max) * 100) : 0}%` }} />
          </span>
          <span className="text-sm tabular">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

async function Stats() {
  const m = getMessages();
  const t = m.clubSpace.stats;
  const ctx = await getClubContext();
  if (!ctx) return <NoClub viewer={await getViewer()} next="/club/statistiques" />;
  // Membership checked just above (active club of the signed-in person).
  const s = aggregateClubStats(await loadClubStatsRows(ctx.club.id), new Date());
  if (s.total === 0) return <p className="text-ink-soft">{t.empty}</p>;

  const fill = s.fillRate === null ? t.noValue : `${Math.round(s.fillRate * 100)} %`;
  const statusMax = Math.max(...s.byStatus.map((r) => r.count));
  const sportMax = Math.max(...s.bySport.map((r) => r.count));
  const monthMax = Math.max(...s.months.map((r) => r.tournaments));

  return (
    <div className="grid gap-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile label={t.tournaments} value={formatCount(s.total)} />
        <Tile label={t.teams} value={formatCount(s.teams)} hint={s.waitlist > 0 ? fmt(t.waitlist, { count: s.waitlist }) : undefined} />
        <Tile label={t.players} value={formatCount(s.players)} />
        <Tile label={t.fillRate} value={fill} hint={t.fillRateHint} />
        <Tile label={t.fees} value={formatEuros(s.expectedFeesCents)} hint={t.feesHint} />
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title={t.byStatus}>
          <BarList max={statusMax} rows={s.byStatus.map((r) => ({ key: r.status, label: m.status[r.status], value: r.count, text: formatCount(r.count) }))} />
        </Section>
        <Section title={t.bySport}>
          <BarList
            max={sportMax}
            rows={s.bySport.map((r) => {
              const sport = getSport(r.slug);
              return {
                key: r.slug,
                label: (
                  <span className="inline-flex items-center gap-1.5" data-sport={sport?.accentToken}>
                    <Icon name={sport?.icon ?? "all"} size={16} />
                    {sport?.name ?? r.slug}
                  </span>
                ),
                value: r.count,
                text: formatCount(r.count),
              };
            })}
          />
        </Section>
      </div>

      <Section title={t.months}>
        <p className="text-sm text-ink-soft">{t.monthsHint}</p>
        <BarList
          max={monthMax}
          rows={s.months.map((r) => ({
            key: r.key,
            label: monthLabel(r.key),
            value: r.tournaments,
            text: fmt(t.monthLine, { tournaments: r.tournaments, teams: r.teams }),
          }))}
        />
      </Section>
    </div>
  );
}

export default function ClubStatsPage() {
  const t = getMessages().clubSpace.stats;
  return (
    <div className="grid gap-6">
      <ClubPageHeader title={t.title} intro={t.intro} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Stats />
      </Suspense>
    </div>
  );
}
