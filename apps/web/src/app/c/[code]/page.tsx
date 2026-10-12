import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isShortCode, normalizeShortCode } from "@orgasport/engine";
import { getSport } from "@orgasport/sports";
import { LogoMark, Wordmark } from "@orgasport/ui";
import { getMessages } from "@/i18n";
import { NextMatchCard } from "@/components/draw/NextMatchCard";
import { RememberDraw } from "@/components/draw/RecentDraws";
import { Badge } from "@/components/ui/Badge";
import { Note } from "@/components/ui/Section";
import { findTournamentByCode, getTeamNextMatch } from "@/lib/data/tournaments";
import { formatDay, formatTime } from "@/lib/format";

/*
 * PHASE 1 PLACEHOLDER. Phase 2 replaces this page with the ultra-light
 * tournament view (server-rendered HTML, no framework JavaScript, < 100 KB).
 */

type Params = Promise<{ code: string }>;
type Search = Promise<{ equipe?: string }>;

export const metadata: Metadata = { robots: { index: false } };

async function Tournament({ params, searchParams }: { params: Params; searchParams: Search }) {
  const m = getMessages();
  const { code: raw } = await params;
  const code = normalizeShortCode(raw);
  if (!isShortCode(code)) notFound();
  const t = await findTournamentByCode(code);
  if (!t) notFound();
  const sport = getSport(t.sport_slug);
  const { equipe } = await searchParams;
  const teamNumber = Number(equipe);
  const next = Number.isInteger(teamNumber) && teamNumber > 0 ? await getTeamNextMatch(t, teamNumber) : null;

  return (
    <div data-sport={sport?.accentToken} className="grid gap-5">
      <RememberDraw code={t.short_code!} name={t.name} />
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {t.status === "live" ? <Badge tone="live">{m.status.live}</Badge> : <Badge>{m.status[t.status]}</Badge>}
          <span className="text-sm font-bold text-ink-soft">{sport?.name}</span>
        </div>
        <h1 className="display text-5xl">{t.name}</h1>
        <p className="text-ink-soft tabular">
          {formatDay(t.starts_at)} · {formatTime(t.starts_at)} · {t.city}
        </p>
      </div>
      {next && <NextMatchCard match={next} />}
      <Note>{m.tournament.phase2}</Note>
    </div>
  );
}

export default function TournamentPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <>
      <header className="mx-auto flex max-w-3xl items-center px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-ink">
          <LogoMark size={24} />
          <Wordmark className="text-lg" />
        </Link>
      </header>
      <main id="contenu" className="mx-auto max-w-3xl px-4 pb-16 pt-2">
        <Suspense fallback={<p className="text-ink-soft">{getMessages().common.loading}</p>}>
          <Tournament params={params} searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}
