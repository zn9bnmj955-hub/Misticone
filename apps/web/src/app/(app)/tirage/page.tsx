import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { normalizeShortCode } from "@orgasport/engine";
import { fmt, getMessages } from "@/i18n";
import { FindDrawForm } from "@/components/draw/FindDrawForm";
import { NextMatchCard } from "@/components/draw/NextMatchCard";
import { RecentDraws } from "@/components/draw/RecentDraws";
import { getMyNextMatch } from "@/lib/data/tournaments";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: getMessages().nav.myDraw };

type Search = Promise<{ code?: string; erreur?: string; saisir?: string }>;

async function Lookup({ searchParams }: { searchParams: Search }) {
  const m = getMessages().findDraw;
  const { code: rawCode, erreur, saisir } = await searchParams;

  // 1. Coming back from /tirage/aller with an unknown or malformed code.
  if (erreur) {
    const code = normalizeShortCode(rawCode ?? "");
    const error = erreur === "format" ? m.invalid : fmt(m.notFound, { code });
    return <FindDrawForm tone="surface" headingLevel="h1" defaultValue={rawCode} error={error} autoFocus />;
  }

  // 2. Playing a live tournament: open the next match directly.
  const viewer = await getViewer();
  const next = viewer && !saisir ? await getMyNextMatch(viewer.id) : null;
  if (next && next.status !== "done") {
    redirect(`/c/${next.tournament.shortCode}?equipe=${next.teamNumber}`);
  }

  // 3. Otherwise: type a code, scan it, or reopen a recent one.
  return (
    <div className="grid gap-6">
      {next && <NextMatchCard match={next} />}
      <FindDrawForm tone="surface" headingLevel="h1" autoFocus={!next} />
    </div>
  );
}

export default function MyDrawPage({ searchParams }: { searchParams: Search }) {
  const m = getMessages().findDraw;
  return (
    <div className="grid gap-6">
      <Suspense fallback={<FindDrawForm tone="surface" headingLevel="h1" />}>
        <Lookup searchParams={searchParams} />
      </Suspense>
      <RecentDraws title={m.recent} />
    </div>
  );
}
