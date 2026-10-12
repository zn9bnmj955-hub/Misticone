import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isShortCode, normalizeShortCode } from "@orgasport/engine";
import { getSport } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { Section, Skeleton } from "@/components/ui/Section";
import { DetailHeader } from "@/components/tournament-detail/DetailHeader";
import { KeyFacts } from "@/components/tournament-detail/KeyFacts";
import { LocationSection } from "@/components/tournament-detail/LocationSection";
import { PracticalInfo } from "@/components/tournament-detail/PracticalInfo";
import { Registrants } from "@/components/tournament-detail/Registrants";
import { RegistrationCta, StaticStatusBadge, StatusBadge } from "@/components/tournament-detail/RegistrationBox";
import { env } from "@/lib/env";
import { formatDay, formatTime } from "@/lib/format";
import { getTournamentDetail } from "./data";

type Params = Promise<{ code: string }>;

async function findDetail(raw: string) {
  const code = normalizeShortCode(raw);
  if (!isShortCode(code)) return null;
  const t = await getTournamentDetail(code);
  const sport = t ? getSport(t.sport_slug) : undefined;
  return t && sport ? { code, t, sport } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const m = getMessages();
  const found = await findDetail((await params).code);
  if (!found) return { title: m.detail.notFound, robots: { index: false } };
  const { code, t, sport } = found;
  const description = fmt(m.detail.metaDescription, {
    sport: sport.name,
    date: formatDay(t.starts_at),
    time: formatTime(t.starts_at),
    city: t.city ?? "",
  });
  const url = `${env.siteUrl}/concours/${code}`;
  return {
    title: t.name,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", title: t.name, description, url, images: t.posterUrl ? [t.posterUrl] : undefined },
  };
}

async function Detail({ params }: { params: Params }) {
  const m = getMessages();
  const found = await findDetail((await params).code);
  if (!found) notFound();
  const { code, t, sport } = found;

  return (
    <article data-sport={sport.accentToken} className="grid gap-8">
      <DetailHeader
        t={t}
        sport={sport}
        badge={
          <Suspense fallback={<StaticStatusBadge status={t.status} />}>
            <StatusBadge t={t} />
          </Suspense>
        }
      />
      <Suspense fallback={<Skeleton className="h-36" />}>
        <RegistrationCta t={t} code={code} />
      </Suspense>
      <KeyFacts t={t} sport={sport} />
      <LocationSection t={t} />
      <PracticalInfo t={t} code={code} />
      <Suspense
        fallback={
          <Section title={m.detail.registrants.title} id="inscrits">
            <Skeleton className="h-48" />
          </Section>
        }
      >
        <Registrants t={t} sport={sport} code={code} />
      </Suspense>
    </article>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-6" aria-hidden="true">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28" />
      <Skeleton className="h-36" />
      <Skeleton className="h-64" />
    </div>
  );
}

/**
 * Tournament details ("Voir plus" from the catalog): key facts, registration,
 * access, practical info and the live list of registrants. Public; the static
 * facts are cached, the live parts are read per request.
 */
export default function TournamentDetailPage({ params }: { params: Params }) {
  const m = getMessages();
  return (
    <div className="grid gap-5">
      <Link href="/concours" className="inline-flex min-h-10 items-center gap-1.5 justify-self-start text-sm font-bold text-ink-soft hover:text-ink">
        <Icon name="arrowLeft" size={18} />
        {m.detail.back}
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}
