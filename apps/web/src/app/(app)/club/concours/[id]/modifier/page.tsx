import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense, type ComponentProps } from "react";
import { enabledSports } from "@orgasport/sports";
import { getMessages } from "@/i18n";
import { Skeleton } from "@/components/ui/Section";
import { TournamentWizard } from "@/components/tournament-form/TournamentWizard";
import { CLUB_CONTEXT_COLUMNS, draftSport, formContextOf, loadDraftAccess, todayParis } from "@/components/tournament-form/draft-access";
import { STEPS, mergeDraft, type Step } from "@/lib/tournament-form";
import { createClient } from "@/lib/supabase/server";
import { getViewer, type Viewer } from "@/lib/viewer";

export const metadata: Metadata = { title: getMessages().wizard.editTitle, robots: { index: false } };

type Params = Promise<{ id: string }>;
type Search = Promise<{ etape?: string; annule?: string }>;
type WizardProps = ComponentProps<typeof TournamentWizard>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isStep = (v: unknown): v is Step => typeof v === "string" && (STEPS as readonly string[]).includes(v);

/**
 * Everything the form needs, read as the signed-in user (RLS) with an
 * explicit club membership check. Published tournaments go to their
 * management page: a draft is the only thing this form edits.
 */
async function loadEditor(id: string, viewer: Viewer, search: { etape?: string; annule?: string }): Promise<WizardProps> {
  const supabase = await createClient();
  const access = await loadDraftAccess(supabase, viewer.id, id);
  if (!access.ok && access.error === "not_draft") redirect(`/club/concours/${id}`);
  if (!access.ok) notFound();
  const t = access.tournament;

  const [{ data: club }, { data: pending }] = await Promise.all([
    supabase.from("clubs").select(CLUB_CONTEXT_COLUMNS).eq("id", t.club_id).single(),
    supabase.from("payments").select("checkout_url, expires_at").eq("tournament_id", id).eq("status", "pending").maybeSingle(),
  ]);
  if (!club) notFound();

  const now = Date.now();
  const ctx = formContextOf(club, { name: viewer.profile?.display_name, email: viewer.email }, now);
  const sport = draftSport(t.sport_slug);
  const resumable = pending?.checkout_url && (!pending.expires_at || Date.parse(pending.expires_at) > now) ? { url: pending.checkout_url } : null;

  // The club's sports first in the sport switch.
  const enabled = enabledSports().map((s) => s.slug);
  const clubSports = (club.sports ?? []).filter((s) => enabled.includes(s));
  return {
    tournamentId: t.id,
    initialForm: mergeDraft(t.draft_form, sport, ctx),
    initialStep: isStep(search.etape) ? search.etape : isStep(t.draft_step) ? t.draft_step : "team",
    savedAt: t.updated_at,
    ctx,
    today: todayParis(),
    sportSlugs: [...clubSports, ...enabled.filter((s) => !clubSports.includes(s))],
    pendingPayment: resumable,
    cancelled: search.annule === "1",
  };
}

async function Editor({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(id)) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect(`/connexion?next=${encodeURIComponent(`/club/concours/${id}/modifier`)}`);
  const props = await loadEditor(id, viewer, search);
  return <TournamentWizard {...props} />;
}

/** The creation form of a draft tournament (club members only). */
export default function EditDraftPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Editor params={params} searchParams={searchParams} />
    </Suspense>
  );
}
