import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { enabledSports } from "@orgasport/sports";
import { getMessages } from "@/i18n";
import { OnboardingFlow, type OnboardingKind } from "@/components/onboarding/OnboardingFlow";
import { getViewer } from "@/lib/viewer";

const KINDS: Record<string, OnboardingKind> = { joueur: "player", club: "club", invite: "guest" };

export function generateStaticParams() {
  return Object.keys(KINDS).map((kind) => ({ kind }));
}

export const metadata: Metadata = { title: getMessages().onboarding.chooseTitle };

type Params = Promise<{ kind: string }>;
type Search = Promise<{ reprendre?: string }>;

async function Flow({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { kind: slug } = await params;
  const kind = KINDS[slug];
  if (!kind) notFound();
  const [{ reprendre }, viewer] = await Promise.all([searchParams, getViewer()]);
  const sports = enabledSports().map((s) => ({ slug: s.slug, name: s.name, icon: s.icon, accentToken: s.accentToken }));
  return <OnboardingFlow kind={kind} sports={sports} signedIn={Boolean(viewer)} resume={reprendre === "1"} />;
}

export default function OnboardingPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<p className="pt-10 text-ink-soft">{getMessages().common.loading}</p>}>
      <Flow params={params} searchParams={searchParams} />
    </Suspense>
  );
}
