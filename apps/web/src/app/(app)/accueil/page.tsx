import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Icon } from "@orgasport/ui";
import { getSport } from "@orgasport/sports";
import { fmt, getMessages } from "@/i18n";
import { SportBar } from "@/components/shell/SportBar";
import { TournamentCard } from "@/components/tournament/TournamentCard";
import { NextMatchCard } from "@/components/draw/NextMatchCard";
import { ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Note, Section, Skeleton } from "@/components/ui/Section";
import {
  closingSoon,
  getMyNextMatch,
  listAnnouncements,
  listClubTournaments,
  listUpcomingTournaments,
  withDistance,
  type TournamentCard as Card,
} from "@/lib/data/tournaments";
import { formatDay } from "@/lib/format";
import { getDevicePrefs, getFeedSports, getViewer, type Viewer } from "@/lib/viewer";

export const metadata: Metadata = { title: getMessages().nav.home };

/** Live first, then nearest within the search radius, then by date. */
function rank(cards: Card[], radiusKm: number): Card[] {
  const score = (c: Card) => {
    let s = 0;
    if (c.status === "live") s -= 1e12;
    if (c.distanceKm != null && c.distanceKm > radiusKm) s += 1e11;
    return s + new Date(c.starts_at ?? 0).getTime();
  };
  return [...cards].sort((a, b) => score(a) - score(b));
}

async function ClubBlock({ viewer }: { viewer: Viewer }) {
  const m = getMessages().home.clubHome;
  const club = viewer.activeClub!;
  const tournaments = (await listClubTournaments(club.id)).filter((t) => t.status !== "archived");
  const status = getMessages().status;
  return (
    <Section
      title={m.title}
      action={
        <ButtonLink href="/club/concours/nouveau" variant="primary">
          <Icon name="plus" size={20} />
          {m.create}
        </ButtonLink>
      }
    >
      {tournaments.length === 0 ? (
        <Note>{m.empty}</Note>
      ) : (
        <ul className="grid gap-2">
          {tournaments.map((t) => (
            <li key={t.id}>
              <Link
                href={`/c/${t.short_code}`}
                data-sport={getSport(t.sport_slug)?.accentToken}
                className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 hover:border-ink-soft"
              >
                <Icon name={getSport(t.sport_slug)?.icon ?? "all"} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-bold">{t.name}</span>
                  <span className="text-sm text-ink-soft tabular">
                    {formatDay(t.starts_at)} · {fmt(m.registered, { count: t.teamCount })}
                  </span>
                </span>
                <Badge tone={t.status === "live" ? "live" : t.status === "draft" ? "warning" : "neutral"}>{status[t.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

async function Feed() {
  const m = getMessages();
  await connection(); // request-time data (dates relative to now)
  const viewer = await getViewer();
  const [sports, prefs] = await Promise.all([getFeedSports(viewer), getDevicePrefs()]);
  const where = viewer?.profile?.lat != null ? viewer.profile : prefs;
  const radius = viewer?.profile?.search_radius_km ?? prefs?.radiusKm ?? 30;

  const [next, upcoming, announcements] = await Promise.all([
    viewer && !viewer.activeClub ? getMyNextMatch(viewer.id) : Promise.resolve(null),
    listUpcomingTournaments(sports),
    listAnnouncements(sports),
  ]);
  const cards = rank(withDistance(upcoming, where), radius);
  const soon = closingSoon(cards);
  const name = viewer?.profile?.display_name?.split(" ")[0];

  return (
    <div className="grid gap-8">
      <h1 className="display text-4xl">{name ? fmt(m.home.greeting, { name }) : m.home.greetingGuest}</h1>

      {next && <NextMatchCard match={next} />}
      {viewer?.activeClub && <ClubBlock viewer={viewer} />}

      {soon.length > 0 && (
        <Section title={m.home.closingSoon}>
          <ul className="grid gap-3">
            {soon.map((t) => (
              <li key={t.id}>
                <TournamentCard t={t} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={m.home.upcomingNearby} action={<Link href="/concours" className="text-sm font-bold text-accent-ink">{m.common.seeAll}</Link>}>
        {cards.length === 0 ? (
          <Note>{m.home.upcomingEmpty}</Note>
        ) : (
          <ul className="grid gap-3">
            {cards.slice(0, 6).map((t) => (
              <li key={t.id}>
                <TournamentCard t={t} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {announcements.length > 0 && (
        <Section title={m.home.clubNews}>
          <ul className="grid gap-3">
            {announcements.map((a) => (
              <li key={a.id} className="grid gap-1 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
                <p className="text-xs font-bold text-ink-soft">
                  {a.clubs?.name} · {formatDay(a.published_at)}
                </p>
                <p className="font-bold">{a.title}</p>
                {a.body && <p className="text-ink-soft">{a.body}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!viewer && (
        <div className="grid gap-3 rounded-[var(--radius-lg)] border-2 border-ink p-4">
          <p>{m.home.createAccountNudge}</p>
          <ButtonLink href="/connexion?mode=signup" variant="inverse" className="justify-self-start">
            {m.home.createAccount}
          </ButtonLink>
        </div>
      )}
      <Note>{m.home.feedSoon}</Note>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="grid gap-6">
      <SportBar />
      <Suspense
        fallback={
          <div className="grid gap-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
          </div>
        }
      >
        <Feed />
      </Suspense>
    </div>
  );
}
