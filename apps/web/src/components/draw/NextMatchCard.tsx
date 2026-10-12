import Link from "next/link";
import { Icon } from "@orgasport/ui";
import { getSport } from "@orgasport/sports";
import { fmt, getMessages } from "@/i18n";
import { formatTime } from "@/lib/format";
import type { MyNextMatch } from "@/lib/data/tournaments";

/** Pinned "En direct" card: venue and time in very large type. */
export function NextMatchCard({ match }: { match: MyNextMatch }) {
  const m = getMessages();
  return (
    <Link
      href={`/c/${match.tournament.shortCode}?equipe=${match.teamNumber}`}
      data-sport={getSport(match.tournament.sportSlug)?.accentToken}
      className="block overflow-hidden rounded-[var(--radius-lg)] border-2 border-ink bg-surface"
    >
      <div className="flex items-center justify-between gap-2 border-b-2 border-ink px-4 py-2.5">
        <span className="inline-flex items-center gap-2 text-sm font-bold">
          <span className="live-dot" aria-hidden="true" />
          {m.home.liveCard} · {match.tournament.name}
        </span>
        <Icon name="arrowRight" size={20} />
      </div>
      <p className="px-4 pt-3 text-sm font-bold text-ink-soft">{m.home.yourMatch}</p>
      <div className="grid grid-cols-2">
        <div className="px-4 pb-3">
          <p className="eyebrow">{match.venueNoun}</p>
          <p className="display text-6xl tabular">{match.venue ?? "—"}</p>
        </div>
        <div className="border-l-2 border-ink px-4 pb-3">
          <p className="eyebrow">{m.home.time}</p>
          <p className="display text-6xl tabular">{match.scheduledAt ? formatTime(match.scheduledAt).replace(" h ", ":") : "—"}</p>
        </div>
      </div>
      {match.opponent && (
        <p className="bg-accent px-4 py-3 text-base font-bold text-on-accent">
          {match.opponentNumber != null
            ? fmt(m.home.againstTeam, { number: match.opponentNumber, names: match.opponent })
            : fmt(m.home.against, { opponent: match.opponent })}
        </p>
      )}
    </Link>
  );
}
