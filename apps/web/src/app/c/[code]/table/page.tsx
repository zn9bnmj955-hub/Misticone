import type { Metadata } from "next";
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
  return actor ? <ScoringTable code={t.short_code} /> : <PinForm code={t.short_code} />;
}

/** Scoring table: organizer account or volunteer PIN. */
export default function TablePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p className="p-6 text-lg font-bold text-ink-soft">{getMessages().table.loading}</p>}>
      <Gate params={params} />
    </Suspense>
  );
}
