import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getMessages } from "@/i18n";
import { PinForm } from "@/components/table/PinForm";
import { ScoringTable } from "@/components/table/ScoringTable";
import { findTournamentRow } from "@/lib/tournament/http";
import { getStaffActor } from "@/lib/tournament/staff";

export const metadata: Metadata = { title: getMessages().table.title, robots: { index: false } };

type Params = Promise<{ code: string }>;

async function Gate({ params }: { params: Params }) {
  const { code } = await params;
  const t = await findTournamentRow(code);
  if (!t?.short_code) notFound();
  const actor = await getStaffActor(t);
  if (actor) return <ScoringTable code={t.short_code} />;
  return t.status === "archived" ? <ClosedTable code={t.short_code} /> : <PinForm code={t.short_code} />;
}

/** After the closing a PIN opens nothing: say so instead of asking for one. */
function ClosedTable({ code }: { code: string }) {
  const m = getMessages().table;
  return (
    <section role="status" className="mx-auto grid max-w-md grid-cols-[minmax(0,1fr)] gap-4 rounded-[var(--radius-lg)] border-2 border-ink bg-surface p-5 mt-6">
      <h1 className="display text-4xl">{m.closedTitle}</h1>
      <p className="text-ink-soft">{m.closedText}</p>
      <a className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius)] bg-accent px-5 font-bold text-on-accent" href={`/c/${code}`}>
        {m.publicPage}
      </a>
      <p className="text-center text-ink-soft">
        {m.orLogin}{" "}
        <Link className="font-bold text-ink underline" href={`/connexion?next=${encodeURIComponent(`/c/${code}/table`)}`}>
          {m.login}
        </Link>
      </p>
    </section>
  );
}

/** Scoring table: organizer account or volunteer PIN. */
export default function TablePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p className="p-6 text-lg font-bold text-ink-soft">{getMessages().table.loading}</p>}>
      <Gate params={params} />
    </Suspense>
  );
}
