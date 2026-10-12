import Link from "next/link";
import type { ReactNode } from "react";
import type { SportConfig } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { formatTime } from "@/lib/format";
import type { TournamentDetail } from "@/app/(app)/concours/[code]/data";
import { dateTile, longDay } from "./links";

/** Name, date, place and organizer: everything a player checks first. */
export function DetailHeader({ t, sport, badge }: { t: TournamentDetail; sport: SportConfig; badge: ReactNode }) {
  const m = getMessages();
  const tile = t.starts_at ? dateTile(t.starts_at) : null;
  return (
    <header className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-sm font-bold text-accent-ink">
          <Icon name={sport.icon} size={18} />
          {sport.name}
        </span>
        {badge}
      </div>
      <div className="flex items-start gap-4">
        {tile && (
          <div
            className="grid w-20 shrink-0 justify-items-center rounded-[var(--radius-lg)] border-2 border-accent bg-surface px-2 py-2 text-center"
            aria-hidden="true"
          >
            <span className="text-xs font-bold uppercase text-ink-soft">{tile.weekday}</span>
            <span className="display tabular text-5xl text-accent-ink">{tile.day}</span>
            <span className="text-sm font-bold uppercase">{tile.month}</span>
          </div>
        )}
        <div className="grid min-w-0 gap-2">
          <h1 className="display text-4xl break-words sm:text-5xl">{t.name}</h1>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-soft">
            {t.starts_at && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <Icon name="calendar" size={18} />
                <span className="tabular first-letter:uppercase">
                  {longDay(t.starts_at)} · {formatTime(t.starts_at)}
                </span>
              </span>
            )}
            {t.city && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="mapPin" size={18} />
                {t.city}
              </span>
            )}
          </p>
          {t.club && (
            <p className="text-sm text-ink-soft">
              <Link
                href={`/clubs/${t.club.slug}`}
                className="inline-flex min-h-8 items-center gap-1.5 font-bold text-ink underline-offset-4 hover:underline"
              >
                <Icon name="club" size={18} />
                {fmt(m.tournament.by, { club: t.club.name })}
              </Link>
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
