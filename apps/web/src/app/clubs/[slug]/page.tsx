import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSport } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Section, Skeleton } from "@/components/ui/Section";
import { TournamentCard } from "@/components/tournament/TournamentCard";
import { ClubLogo } from "@/components/club/ClubLogo";
import { FollowButton } from "@/components/club/FollowButton";
import { formatLongDate } from "@/components/club/model";
import { getPublicClub, isFollowingClub, type PublicClub } from "@/lib/data/clubs";
import { env } from "@/lib/env";
import { formatDay } from "@/lib/format";
import { getViewer } from "@/lib/viewer";
import { setFollowClub } from "@/app/(app)/club/actions";

type Params = Promise<{ slug: string }>;

/**
 * The app navigation reads the pathname, unknown before the request for a
 * club slug: no static shell (the club facts are cached, so it stays fast).
 */
export const instant = false;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const t = getMessages().clubSpace;
  const found = await getPublicClub((await params).slug);
  if (!found) return { title: t.publicPage.notFound, robots: { index: false } };
  const { club } = found;
  const kind = t.kinds[club.kind];
  const description = club.city
    ? fmt(t.publicPage.metaDescription, { kind, city: club.city })
    : fmt(t.publicPage.metaDescriptionNoCity, { kind });
  const url = `${env.siteUrl}/clubs/${club.slug}`;
  return {
    title: club.name,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", title: club.name, description, url, images: club.logoUrl ? [club.logoUrl] : undefined },
  };
}

/** Per-viewer part (session): follow toggle, and a shortcut for the club's own members. */
async function ViewerActions({ club }: { club: PublicClub["club"] }) {
  const t = getMessages().clubSpace.publicPage;
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <ButtonLink href={`/connexion?next=${encodeURIComponent(`/clubs/${club.slug}`)}`} variant="outline">
        <Icon name="bell" size={20} />
        {t.followSignIn}
      </ButtonLink>
    );
  }
  const following = await isFollowingClub(viewer.id, club.id);
  const member = viewer.clubs.some((c) => c.id === club.id);
  return (
    <div className="flex flex-wrap items-start gap-3">
      <FollowButton
        clubId={club.id}
        initial={following}
        action={setFollowClub}
        labels={{ follow: t.follow, following: t.following, unfollow: t.unfollow, hint: t.followHint }}
      />
      {member && (
        <ButtonLink href="/club" variant="ghost">
          <Icon name="club" size={20} />
          {t.manage}
        </ButtonLink>
      )}
    </div>
  );
}

async function ClubPublic({ params }: { params: Params }) {
  const m = getMessages();
  const t = m.clubSpace.publicPage;
  const found = await getPublicClub((await params).slug);
  if (!found) notFound();
  const { club, upcoming, past, announcements } = found;
  const sports = club.sports.map((slug) => getSport(slug)).filter((s) => s !== undefined);
  const place = [club.postcode, club.city].filter(Boolean).join(" ");

  return (
    <div className="grid gap-8" data-sport={sports.length === 1 ? sports[0]?.accentToken : undefined}>
      <header className="flex flex-wrap items-center gap-4">
        <ClubLogo url={club.logoUrl} name={club.name} alt={fmt(m.clubSpace.logoAlt, { club: club.name })} size="lg" />
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 className="display text-5xl">{club.name}</h1>
          <p className="text-ink-soft">
            {m.clubSpace.kinds[club.kind]}
            {place && ` · ${place}`}
          </p>
          {sports.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-2">
              {sports.map((s) => (
                <li key={s.slug} data-sport={s.accentToken} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-bold text-on-accent">
                  <Icon name={s.icon} size={16} />
                  {s.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      <Suspense fallback={<Skeleton className="h-12 w-56" />}>
        <ViewerActions club={club} />
      </Suspense>

      <Section title={t.upcoming}>
        {upcoming.length === 0 ? (
          <p className="text-ink-soft">{t.noUpcoming}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {upcoming.map((card) => (
              <li key={card.id}>
                <TournamentCard t={card} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {announcements.length > 0 && (
        <Section title={t.announcements}>
          <ul className="grid gap-3">
            {announcements.map((a) => {
              const sport = a.sport_slug ? getSport(a.sport_slug) : undefined;
              return (
                <li key={a.id}>
                  <Card className="grid gap-2" data-sport={sport?.accentToken}>
                    <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                      {sport && <Icon name={sport.icon} size={16} />}
                      {a.published_at && formatLongDate(a.published_at)}
                    </p>
                    <h3 className="text-lg font-bold">{a.title}</h3>
                    {a.body && <p className="whitespace-pre-line">{a.body}</p>}
                    {a.link_url && (
                      <a href={a.link_url} rel="noopener noreferrer nofollow" target="_blank" className="justify-self-start font-bold text-accent-ink underline underline-offset-4">
                        {m.clubSpace.announcements.openLink}
                      </a>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {past.length > 0 && (
        <Section title={t.past}>
          <ul className="grid gap-2">
            {past.map((p) => {
              const sport = getSport(p.sport_slug);
              return (
                <li key={p.id}>
                  <Link
                    href={`/concours/${p.short_code}`}
                    data-sport={sport?.accentToken}
                    className="flex min-h-12 items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-3 hover:border-ink-soft"
                  >
                    <Icon name={sport?.icon ?? "trophy"} />
                    <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
                    <span className="text-sm text-ink-soft tabular">{formatDay(p.starts_at)}</span>
                    <span className="text-sm font-bold text-accent-ink">{t.results}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {(club.description || club.contact_name || club.contact_email || club.contact_phone || club.federation) && (
        <div className="grid gap-4 md:grid-cols-2">
          {club.description && (
            <Section title={t.about}>
              <p className="whitespace-pre-line">{club.description}</p>
            </Section>
          )}
          {(club.contact_name || club.contact_email || club.contact_phone || club.federation) && (
            <Section title={t.contact}>
              <ul className="grid gap-2">
                {club.contact_name && (
                  <li className="font-semibold">{club.contact_name}</li>
                )}
                {club.contact_email && (
                  <li className="flex items-center gap-2">
                    <Icon name="mail" size={18} />
                    <a href={`mailto:${club.contact_email}`} className="font-semibold underline underline-offset-4">
                      {club.contact_email}
                    </a>
                  </li>
                )}
                {club.contact_phone && (
                  <li>
                    <a href={`tel:${club.contact_phone.replace(/[^\d+]/g, "")}`} className="font-semibold underline underline-offset-4 tabular">
                      {club.contact_phone}
                    </a>
                  </li>
                )}
                {club.federation && (
                  <li className="text-sm text-ink-soft">
                    {club.affiliation_number ? fmt(t.affiliation, { federation: club.federation, number: club.affiliation_number }) : club.federation}
                  </li>
                )}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

/** Public page of a club: cached facts (`club:<slug>` tag), the follow button read per request. */
export default function ClubPublicPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ClubPublic params={params} />
    </Suspense>
  );
}
