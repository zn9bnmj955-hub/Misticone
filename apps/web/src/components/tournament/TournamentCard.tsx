import Link from "next/link";
import { Icon } from "@orgasport/ui";
import { getSport } from "@orgasport/sports";
import { fmt, getMessages } from "@/i18n";
import { formatDay, formatEuros, formatTime } from "@/lib/format";
import type { TournamentCard as Card } from "@/lib/data/tournaments";
import { Badge } from "@/components/ui/Badge";

export function TournamentCard({ t }: { t: Card }) {
  const m = getMessages();
  const sport = getSport(t.sport_slug);
  const format = sport?.teamFormats.find((f) => f.id === t.team_format)?.label;
  const fill = t.max_teams ? Math.min(1, t.teamCount / t.max_teams) : null;
  const live = t.status === "live";
  return (
    <Link
      href={`/c/${t.short_code}`}
      data-sport={sport?.accentToken}
      className="group grid gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 transition hover:border-ink-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-ink-soft">
          <Icon name={sport?.icon ?? "all"} size={18} />
          <span>{sport?.name}</span>
          {format && <span aria-hidden="true">·</span>}
          {format && <span className="truncate">{format}</span>}
        </div>
        {live ? <Badge tone="live">{m.status.live}</Badge> : <Badge>{m.status[t.status]}</Badge>}
      </div>
      <div className="grid gap-1">
        <h3 className="display text-2xl group-hover:text-accent-ink">{t.name}</h3>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <Icon name="calendar" size={16} />
            <span className="tabular">
              {formatDay(t.starts_at)} · {formatTime(t.starts_at)}
            </span>
          </span>
          {t.city && (
            <span className="inline-flex items-center gap-1">
              <Icon name="mapPin" size={16} />
              {t.city}
              {t.distanceKm != null && <span className="tabular"> · {Math.round(t.distanceKm)} km</span>}
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold">
          {t.fee_cents > 0
            ? fmt(m.tournament.fee, { amount: formatEuros(t.fee_cents), per: t.fee_per === "player" ? m.tournament.perPlayer : m.tournament.perTeam })
            : m.tournament.free}
        </span>
        {t.prize_text && <span className="text-ink-soft">· {t.prize_text}</span>}
        <Badge tone={t.eligibility === "licensed" ? "warning" : "neutral"} className="ml-auto">
          {t.eligibility === "licensed" ? m.tournament.licensed : t.eligibility === "mixed" ? m.tournament.mixed : m.tournament.open}
        </Badge>
      </div>
      {fill !== null && (
        <div className="grid gap-1">
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(fill * 100)}%` }} />
          </div>
          <p className="text-xs font-bold text-ink-soft tabular">
            {fmt(m.tournament.teamsCount, { count: t.teamCount, max: t.max_teams! })}
            {t.club && <span className="font-semibold"> · {fmt(m.tournament.by, { club: t.club.name })}</span>}
          </p>
        </div>
      )}
    </Link>
  );
}
