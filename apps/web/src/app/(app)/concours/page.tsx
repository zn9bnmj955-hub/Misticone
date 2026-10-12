import type { Metadata } from "next";
import { Suspense } from "react";
import { getMessages } from "@/i18n";
import { SportBar } from "@/components/shell/SportBar";
import { TournamentCard } from "@/components/tournament/TournamentCard";
import { Note, Skeleton } from "@/components/ui/Section";
import { listUpcomingTournaments, withDistance } from "@/lib/data/tournaments";
import { ALL_SPORTS } from "@/lib/prefs";
import { getDevicePrefs, getSportFilter, getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: getMessages().catalog.title };

async function Catalog() {
  const m = getMessages();
  const [filter, prefs, viewer] = await Promise.all([getSportFilter(), getDevicePrefs(), getViewer()]);
  const where = viewer?.profile?.lat != null ? viewer.profile : prefs;
  const cards = withDistance(await listUpcomingTournaments(filter === ALL_SPORTS ? null : [filter], 50), where);
  if (cards.length === 0) return <Note>{m.catalog.empty}</Note>;
  return (
    <ul className="grid gap-3">
      {cards.map((t) => (
        <li key={t.id}>
          <TournamentCard t={t} />
        </li>
      ))}
    </ul>
  );
}

export default function CatalogPage() {
  const m = getMessages();
  return (
    <div className="grid gap-6">
      <SportBar />
      <h1 className="display text-5xl">{m.catalog.title}</h1>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Catalog />
      </Suspense>
      <Note>{m.catalog.phase4}</Note>
    </div>
  );
}
