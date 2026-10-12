import { cookies } from "next/headers";
import type { SportConfig } from "@orgasport/sports";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { Note, Section } from "@/components/ui/Section";
import { cn } from "@/components/ui/cn";
import { getMyTeamNumbers, getRoster, type RegistrantStatus } from "@/lib/data/registrants";
import { getViewer } from "@/lib/viewer";
import { myTeamCookie } from "@/terrain/cookies";
import type { TournamentDetail } from "@/app/(app)/concours/[code]/data";
import { LiveRefresh } from "./LiveRefresh";
import { registrantNoun } from "./RegistrationBox";

const FOLLOWED = new Set<TournamentDetail["status"]>(["published", "registration_closed", "check_in", "live"]);

/** Teams the person registered: their account, or this device ("C'est mon équipe"). */
async function myTeams(t: TournamentDetail, code: string): Promise<Set<number>> {
  const [store, viewer] = await Promise.all([cookies(), getViewer()]);
  const mine = new Set<number>(viewer ? await getMyTeamNumbers(t.id, viewer.id) : []);
  const fromDevice = Number(store.get(myTeamCookie(code))?.value);
  if (Number.isInteger(fromDevice) && fromDevice > 0) mine.add(fromDevice);
  return mine;
}

/**
 * Live list of registrants: number, public label (full names or initials, as
 * the organizer chose), club, waiting list. Never licenses nor contacts.
 */
export async function Registrants({ t, sport, code }: { t: TournamentDetail; sport: SportConfig; code: string }) {
  const m = getMessages();
  const r = m.detail.registrants;
  const [roster, mine] = await Promise.all([getRoster(t.id, t.name_display), myTeams(t, code)]);
  if (!roster) {
    return (
      <Section title={r.title} id="inscrits">
        <Note>{r.error}</Note>
      </Section>
    );
  }
  const followed = FOLLOWED.has(roster.status);
  const badge = (status: RegistrantStatus) =>
    status === "waitlist" ? (
      <Badge tone="warning">{r.status.waitlist}</Badge>
    ) : status === "forfeit" ? (
      <Badge>{r.status.forfeit}</Badge>
    ) : status === "checked_in" && roster.status === "check_in" ? (
      <Badge tone="success">{r.status.checked_in}</Badge>
    ) : null;

  return (
    <Section
      title={r.title}
      id="inscrits"
      action={
        followed ? (
          <span className="inline-flex items-center gap-2 pb-1 text-xs font-bold text-ink-soft">
            <span className="live-dot" aria-hidden="true" />
            {r.live}
          </span>
        ) : undefined
      }
    >
      {followed && <LiveRefresh code={code} />}
      <p className="font-bold tabular" aria-live="polite">
        {fmt(r.count, { count: roster.active, noun: registrantNoun(t, sport, roster.active) })}
        {roster.waitlist > 0 && <span className="font-semibold text-ink-soft"> · {fmt(r.waitlistCount, { count: roster.waitlist })}</span>}
      </p>
      {roster.teams.length === 0 ? (
        <Note>{roster.status === "published" ? r.emptyOpen : r.empty}</Note>
      ) : (
        <ol className="grid gap-1.5">
          {roster.teams.map((team) => {
            const isMine = mine.has(team.number);
            return (
              <li
                key={team.number}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-[var(--radius)] border px-3 py-2",
                  isMine ? "border-accent bg-accent-soft" : "border-line bg-surface",
                  team.status === "waitlist" && !isMine && "border-dashed",
                )}
              >
                <span className="display w-10 shrink-0 text-center text-2xl tabular text-ink-soft" aria-hidden="true">
                  {team.number}
                </span>
                <span className="sr-only">{fmt(r.team, { number: team.number })}</span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-bold">{team.label}</span>
                  {team.club && <span className="truncate text-sm text-ink-soft">{team.club}</span>}
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  {isMine && <Badge tone="accent">{r.yours}</Badge>}
                  {badge(team.status)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
