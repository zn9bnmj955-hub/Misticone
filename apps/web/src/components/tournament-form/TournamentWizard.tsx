"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSport, venueLabel } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { formatTime } from "@/lib/format";
import { STEPS, validateForm, venueLabelsOf, type FormContext, type Step, type TournamentForm } from "@/lib/tournament-form";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { saveDraft } from "@/app/(app)/club/concours/actions";
import { issueMessage, issuesByField, stepOfIssue, venueVars } from "./issues";
import { keepReserved } from "./venue-names";
import { CommunicationStep } from "./steps/CommunicationStep";
import { DrawStep } from "./steps/DrawStep";
import { GeneralStep } from "./steps/GeneralStep";
import { MoneyStep } from "./steps/MoneyStep";
import { ParticipantsStep } from "./steps/ParticipantsStep";
import { SummaryStep } from "./steps/SummaryStep";
import { TeamStep } from "./steps/TeamStep";
import { VenuesStep } from "./steps/VenuesStep";
import type { StepProps } from "./steps/types";

const AUTOSAVE_MS = 800;
const RETRY_MS = 5000;

type SaveState = { state: "saved"; at: string | null } | { state: "saving" } | { state: "error"; code: string } | { state: "locked" };

const isStep = (v: string | null | undefined): v is Step => Boolean(v) && (STEPS as readonly string[]).includes(v!);

/** Changing the venues may drop reserved ones that no longer exist. */
function applyPatch(form: TournamentForm, patch: Partial<TournamentForm>): TournamentForm {
  const next = { ...form, ...patch };
  if ("venueCount" in patch || "venueLabels" in patch) next.reservedLabels = keepReserved(next.reservedLabels, venueLabelsOf(next));
  return next;
}

/**
 * "Créer un concours": one screen per group of questions, every answer
 * already filled with the sport's defaults, saved as a draft while typing.
 * The step lives in the URL (?etape=…) so the browser's back button and a
 * reload land on the same screen.
 */
export function TournamentWizard({
  tournamentId,
  initialForm,
  initialStep,
  savedAt,
  ctx,
  today,
  sportSlugs,
  pendingPayment,
  cancelled,
}: {
  tournamentId: string;
  initialForm: TournamentForm;
  initialStep: Step;
  savedAt: string | null;
  ctx: FormContext;
  today: string;
  sportSlugs: string[];
  pendingPayment: { url: string } | null;
  cancelled: boolean;
}) {
  const m = getMessages();
  const w = m.wizard;
  const router = useRouter();
  const params = useSearchParams();
  const fromUrl = params.get("etape");
  const step: Step = isStep(fromUrl) ? fromUrl : initialStep;
  const index = STEPS.indexOf(step);

  const [form, setForm] = useState(initialForm);
  const sport = getSport(form.sportSlug) ?? getSport(initialForm.sportSlug)!;
  const vars = useMemo(() => venueVars(sport), [sport]);

  // ---------------------------------------------------------------------
  // Autosave: debounced, one request at a time, retried on failure.
  // ---------------------------------------------------------------------
  const [save, setSave] = useState<SaveState>({ state: "saved", at: savedAt });
  const latest = useRef({ form, step });
  const dirty = useRef(false);
  const locked = useRef(false);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSave = useCallback((): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    queue.current = queue.current.then(async () => {
      if (locked.current) return false;
      if (!dirty.current) return true;
      dirty.current = false;
      const { form: f, step: s } = latest.current;
      setSave({ state: "saving" });
      try {
        const res = await saveDraft(tournamentId, f, s);
        if (res.ok) {
          if (!dirty.current) setSave({ state: "saved", at: res.savedAt });
          return true;
        }
        if (res.error === "not_draft" || res.error === "not_found") {
          locked.current = true;
          setSave({ state: "locked" });
          return false;
        }
        dirty.current = true;
        setSave({ state: "error", code: res.error });
      } catch {
        dirty.current = true;
        setSave({ state: "error", code: "network" });
      }
      return false;
    });
    return queue.current;
  }, [tournamentId]);

  // A failed save is tried again a little later.
  useEffect(() => {
    if (save.state !== "error") return;
    const retry = setTimeout(() => void runSave(), RETRY_MS);
    return () => clearTimeout(retry);
  }, [save, runSave]);

  useEffect(() => {
    // Nothing changed (first render, or React re-running effects in development).
    if (latest.current.form === form && latest.current.step === step) return;
    latest.current = { form, step };
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void runSave(), AUTOSAVE_MS);
  }, [form, step, runSave]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current && !locked.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // ---------------------------------------------------------------------
  // Validation: errors appear once a step has been left (or on the summary).
  // ---------------------------------------------------------------------
  const issues = useMemo(() => {
    const res = validateForm(form, getSport, today);
    return res.ok ? [] : res.issues;
  }, [form, today]);
  const byField = useMemo(() => issuesByField(issues), [issues]);
  const [revealed, setRevealed] = useState<ReadonlySet<Step>>(() => new Set());
  const [showCancelled, setShowCancelled] = useState(cancelled);
  const [blockedMsg, setBlockedMsg] = useState(false);

  const error = useCallback(
    (field: string) => {
      const issue = byField.get(field);
      if (!issue) return undefined;
      if (step !== "summary" && !revealed.has(stepOfIssue(issue))) return undefined;
      return issueMessage(issue, vars);
    },
    [byField, revealed, step, vars],
  );

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const goTo = useCallback(
    (target: Step) => {
      setRevealed((r) => new Set(r).add(step));
      setBlockedMsg(false);
      if (target === step) return;
      setShowCancelled(false);
      moved.current = true;
      window.history.pushState(null, "", `?etape=${target}`);
    },
    [step],
  );

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  function next() {
    const own = issues.filter((i) => stepOfIssue(i) === step);
    if (own.length > 0) {
      setRevealed((r) => new Set(r).add(step));
      setBlockedMsg(true);
      requestAnimationFrame(() => {
        const el = bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        el?.focus();
        el?.scrollIntoView({ block: "center" });
      });
      return;
    }
    goTo(STEPS[index + 1] ?? "summary");
  }

  function back() {
    if (index === 0) {
      void runSave().finally(() => router.push("/club"));
      return;
    }
    goTo(STEPS[index - 1]!);
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  const update = useCallback((patch: Partial<TournamentForm>) => setForm((f) => applyPatch(f, patch)), []);
  const replace = useCallback((f: TournamentForm) => setForm(f), []);
  const props: StepProps = { tournamentId, form, sport, ctx, today, update, replace, error, vars, goTo };
  const stepName = (s: Step) => fmt(w.steps[s] ?? s, { venues: venueLabel(sport, true) });
  const total = STEPS.length;

  let body: React.ReactNode;
  switch (step) {
    case "team":
      body = <TeamStep {...props} />;
      break;
    case "general":
      body = <GeneralStep {...props} sportSlugs={sportSlugs} />;
      break;
    case "participants":
      body = <ParticipantsStep {...props} />;
      break;
    case "money":
      body = <MoneyStep {...props} />;
      break;
    case "draw":
      body = <DrawStep {...props} />;
      break;
    case "venues":
      body = <VenuesStep {...props} />;
      break;
    case "communication":
      body = <CommunicationStep {...props} />;
      break;
    case "summary":
      body = <SummaryStep {...props} issues={issues} flush={runSave} cancelled={showCancelled} />;
      break;
  }

  return (
    <div data-sport={sport.accentToken} className="grid gap-6">
      {pendingPayment && save.state !== "locked" && (
        <div className="grid gap-2 rounded-[var(--radius-lg)] border-2 border-warning bg-warning/15 p-4">
          <p className="flex items-center gap-2 font-black">
            <Icon name="clock" size={20} className="shrink-0 text-warning" />
            {w.pendingPayment.title}
          </p>
          <p className="text-sm">{w.pendingPayment.text}</p>
          <a href={pendingPayment.url} className="inline-flex min-h-12 items-center gap-2 justify-self-start font-bold text-accent-ink underline">
            {w.pendingPayment.resume}
            <Icon name="arrowRight" size={18} />
          </a>
        </div>
      )}

      {save.state === "locked" && (
        <div role="alert" className="grid gap-3 rounded-[var(--radius-lg)] border-2 border-danger bg-surface p-4">
          <p className="font-bold">{w.save.locked}</p>
          <ButtonLink href={`/club/concours/${tournamentId}`} className="justify-self-start">
            {w.save.lockedLink}
          </ButtonLink>
        </div>
      )}

      <header className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="eyebrow">
            {fmt(w.progress, { current: index + 1, total })} · {stepName(step)}
          </p>
          <SaveStatus save={save} onRetry={() => void runSave()} />
        </div>
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
          aria-valuetext={`${fmt(w.progress, { current: index + 1, total })} · ${stepName(step)}`}
        >
          {STEPS.map((s, i) => (
            <span key={s} className={cn("h-2 rounded-full transition-colors", i <= index ? "bg-accent" : "bg-surface-2")} />
          ))}
        </div>
        <h1 ref={headingRef} tabIndex={-1} className="display text-4xl outline-none sm:text-5xl">
          {fmt(w.stepTitles[step] ?? step, { venues: sport.venue.noun.plural })}
        </h1>
      </header>

      <div ref={bodyRef}>{body}</div>

      {step !== "summary" && (
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-20 -mx-4 grid gap-2 border-t border-line bg-bg/95 px-4 pb-3 pt-3 backdrop-blur lg:bottom-0">
          {blockedMsg && issues.some((i) => stepOfIssue(i) === step) && (
            <p role="alert" className="text-sm font-bold text-danger">
              {w.fixFirst}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={back} className="shrink-0">
              <Icon name="arrowLeft" />
              <span className="sr-only sm:not-sr-only">{w.back}</span>
            </Button>
            <Button size="lg" className="flex-1" onClick={next}>
              {w.next}
              <Icon name="arrowRight" />
            </Button>
          </div>
          <button type="button" onClick={() => goTo("summary")} className="min-h-10 justify-self-center rounded-full px-4 text-sm font-bold text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            {w.skipToSummary}
          </button>
        </div>
      )}
      {step === "summary" && (
        <Button variant="outline" size="lg" onClick={back} className="justify-self-start">
          <Icon name="arrowLeft" />
          {w.back}
        </Button>
      )}
    </div>
  );
}

function SaveStatus({ save, onRetry }: { save: SaveState; onRetry: () => void }) {
  const t = getMessages().wizard.save;
  if (save.state === "locked") return null;
  return (
    <p role="status" className={cn("flex items-center gap-1.5 text-sm", save.state === "error" ? "font-bold text-danger" : "text-ink-soft")}>
      {save.state === "saving" && t.saving}
      {save.state === "saved" && (
        <>
          <Icon name="check" size={16} className="text-success" />
          {save.at ? fmt(t.saved, { time: formatTime(save.at) }) : t.savedNoTime}
        </>
      )}
      {save.state === "error" && (
        <>
          {t.error}
          <button type="button" onClick={onRetry} className="min-h-10 rounded-full px-2 underline">
            {t.retry}
          </button>
        </>
      )}
    </p>
  );
}
