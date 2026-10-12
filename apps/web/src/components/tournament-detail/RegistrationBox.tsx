import { connection } from "next/server";
import type { SportConfig } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { formatDay, formatTime } from "@/lib/format";
import { getRoster, type Roster } from "@/lib/data/registrants";
import { registrationWindow, type RegistrationWindow } from "@/lib/tournament/registration-rules";
import type { TournamentDetail } from "@/app/(app)/concours/[code]/data";

/**
 * Parts of the page that depend on the live roster and the current time
 * (rendered per request inside <Suspense>): status badge, main call to
 * action and places gauge. They share one roster read per request.
 */
type Live = { roster: Roster | null; status: TournamentDetail["status"]; window: RegistrationWindow };

async function readLive(t: TournamentDetail): Promise<Live> {
  await connection();
  const roster = await getRoster(t.id, t.name_display);
  const status = roster?.status ?? t.status;
  // Without a roster (database hiccup) the form re-checks everything: offer it.
  const window = registrationWindow({ ...t, status }, roster?.active ?? 0, Date.now());
  return { roster, status, window };
}

/** Registrants are teams, or players for a mêlée (individual registration). */
export function registrantNoun(t: TournamentDetail, sport: SportConfig, count: number): string {
  const individual = sport.teamFormats.find((f) => f.id === t.team_format)?.individualRegistration;
  const noun = individual ? getMessages().detail.registrants.individual : sport.teamNoun;
  return count === 1 ? noun.singular : noun.plural;
}

const WINDOW_TONE: Record<RegistrationWindow, "accent" | "warning" | "neutral"> = {
  open: "accent",
  waitlist: "warning",
  full: "warning",
  closed: "neutral",
  onsite_only: "neutral",
};

export function StaticStatusBadge({ status }: { status: TournamentDetail["status"] }) {
  const m = getMessages();
  return status === "live" ? <Badge tone="live">{m.status.live}</Badge> : <Badge>{m.status[status]}</Badge>;
}

export async function StatusBadge({ t }: { t: TournamentDetail }) {
  const { status, window } = await readLive(t);
  if (status !== "published") return <StaticStatusBadge status={status} />;
  return <Badge tone={WINDOW_TONE[window]}>{getMessages().detail.window[window]}</Badge>;
}

export async function RegistrationCta({ t, code }: { t: TournamentDetail; code: string }) {
  const m = getMessages();
  const c = m.detail.cta;
  const { roster, status, window } = await readLive(t);
  const live = `/c/${code}`;

  if (status === "live" || status === "check_in") {
    return (
      <div className="grid gap-2">
        <ButtonLink href={live} size="lg" className="w-full sm:w-auto sm:justify-self-start">
          {status === "live" && <span className="live-dot bg-on-accent" aria-hidden="true" />}
          {c.follow}
          <Icon name="arrowRight" size={20} />
        </ButtonLink>
      </div>
    );
  }
  if (status === "finished" || status === "archived") {
    return (
      <ButtonLink href={live} size="lg" className="w-full sm:w-auto sm:justify-self-start">
        <Icon name="trophy" size={20} />
        {c.results}
      </ButtonLink>
    );
  }

  const canRegister = window === "open" || window === "waitlist";
  const left = t.max_teams !== null && roster ? t.max_teams - roster.active : null;
  const note =
    window === "waitlist" ? c.waitlistNote : window === "full" ? c.fullNote : window === "closed" ? c.closedNote : window === "onsite_only" ? c.onsiteNote : null;

  return (
    <div className="grid gap-3 rounded-[var(--radius-lg)] border-2 border-ink bg-surface p-4">
      {!canRegister && (
        <p className="display text-2xl" role="status">
          {m.detail.window[window]}
        </p>
      )}
      {note && <p className="text-sm text-ink-soft">{note}</p>}
      {canRegister && (
        <ButtonLink href={`/c/${code}/inscription`} size="lg" className="w-full sm:w-auto sm:justify-self-start">
          {window === "waitlist" ? c.registerWaitlist : c.register}
          <Icon name="arrowRight" size={20} />
        </ButtonLink>
      )}
      {window === "open" && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-soft">
          {left !== null && left <= 10 && (
            <strong className="text-warning">{left === 1 ? c.placeLeft : fmt(c.placesLeft, { count: left })}</strong>
          )}
          {t.registration_closes_at && (
            <span className="tabular">
              {fmt(c.closesAt, { date: formatDay(t.registration_closes_at), time: formatTime(t.registration_closes_at) })}
            </span>
          )}
        </p>
      )}
      <ButtonLink href={live} variant={canRegister ? "ghost" : "outline"} className="w-full sm:w-auto sm:justify-self-start">
        <Icon name="live" size={20} />
        {c.follow}
      </ButtonLink>
    </div>
  );
}

/** "23 / 64 équipes · 41 places restantes", or "Complet · liste d'attente". */
export async function PlacesGauge({ t, sport }: { t: TournamentDetail; sport: SportConfig }) {
  const f = getMessages().detail.facts;
  const { roster } = await readLive(t);
  if (!roster) return <span className="text-ink-soft">—</span>;
  const count = roster.active;
  if (t.max_teams === null) {
    return <span className="tabular">{fmt(f.gaugeNoMax, { count, noun: registrantNoun(t, sport, count) })}</span>;
  }
  const max = t.max_teams;
  const left = Math.max(0, max - count);
  const fill = Math.min(1, count / max);
  const text =
    left === 0
      ? t.waitlist_enabled
        ? f.gaugeFull
        : f.gaugeFullClosed
      : fmt(f.gauge, { count, max, noun: registrantNoun(t, sport, max), left: left === 1 ? f.leftOne : fmt(f.left, { count: left }) });
  return (
    <span className="grid gap-1.5">
      <span
        className="block h-2.5 overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(count, max)}
        aria-valuetext={text}
      >
        <span className={`block h-full rounded-full ${left === 0 ? "bg-warning" : "bg-accent"}`} style={{ width: `${Math.round(fill * 100)}%` }} />
      </span>
      <span className="text-sm font-bold tabular">{text}</span>
      {roster.waitlist > 0 && <span className="text-xs text-ink-soft tabular">{fmt(f.waitlist, { count: roster.waitlist })}</span>}
    </span>
  );
}
