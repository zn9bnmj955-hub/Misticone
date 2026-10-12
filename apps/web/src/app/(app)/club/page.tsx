import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getSport } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Note, Section, Skeleton } from "@/components/ui/Section";
import { listClubTournaments } from "@/lib/data/tournaments";
import { formatDay } from "@/lib/format";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: getMessages().club.title };

async function ClubContent() {
  const m = getMessages();
  const viewer = await getViewer();
  const club = viewer?.activeClub;
  if (!club) {
    return (
      <Card className="grid gap-3">
        <p>{m.club.noClub}</p>
        <ButtonLink href="/inscription/club" className="justify-self-start">{m.profile.addClub}</ButtonLink>
      </Card>
    );
  }
  const tournaments = await listClubTournaments(club.id);
  return (
    <div className="grid gap-6">
      <p className="display text-3xl text-accent-ink">{club.name}</p>
      <Section
        title={m.club.tournaments}
        action={
          <ButtonLink href="/club/concours/nouveau">
            <Icon name="plus" size={20} />
            {m.home.clubHome.create}
          </ButtonLink>
        }
      >
        <ul className="grid gap-2">
          {tournaments.map((t) => (
            <li key={t.id}>
              <Link href={`/c/${t.short_code}`} data-sport={getSport(t.sport_slug)?.accentToken} className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 hover:border-ink-soft">
                <Icon name={getSport(t.sport_slug)?.icon ?? "all"} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-bold">{t.name}</span>
                  <span className="text-sm text-ink-soft tabular">
                    {formatDay(t.starts_at)} · {fmt(m.home.clubHome.registered, { count: t.teamCount })} · {t.short_code}
                  </span>
                </span>
                <Badge tone={t.status === "live" ? "live" : "neutral"}>{m.status[t.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <Note>{m.club.soon}</Note>
    </div>
  );
}

export default function ClubPage() {
  return (
    <div className="grid gap-6">
      <h1 className="display text-5xl">{getMessages().club.title}</h1>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <ClubContent />
      </Suspense>
    </div>
  );
}
