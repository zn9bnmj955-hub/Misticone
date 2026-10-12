"use client";
import { useId, useMemo, useState } from "react";
import type { SportConfig } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { DATE_RE, TIME_RE, suggestFormat, type FormatAdvice, type TournamentForm } from "@/lib/tournament-form";
import { formatLabel, hm } from "./display";
import { Stepper } from "./fields";

function safeAdvice(form: TournamentForm, sport: SportConfig, teams: number): FormatAdvice | null {
  if (!DATE_RE.test(form.date) || !TIME_RE.test(form.startTime)) return null;
  try {
    return suggestFormat(form, sport, teams);
  } catch {
    return null;
  }
}

/**
 * « Aide-moi à choisir »: a format proposal from the expected number of
 * teams, the venues and the start time (pure computation, instant). The
 * organizer accepts it or keeps their settings. Phase 6 will let the AI
 * assistant explain the proposal: it plugs in here.
 */
export function FormatAdvisor({
  form,
  sport,
  onApply,
  variant = "primary",
}: {
  form: TournamentForm;
  sport: SportConfig;
  onApply: (changes: FormatAdvice["changes"]) => void;
  variant?: "primary" | "outline";
}) {
  const w = getMessages().wizard;
  const t = w.advisor;
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState(form.maxTeams);
  const [applied, setApplied] = useState(false);
  const advice = useMemo(() => (open ? safeAdvice(form, sport, teams) : null), [open, form, sport, teams]);
  const venues = sport.venue.noun.plural;
  // The reasons speak of the sport's own teams and venues (« doublettes », « tables »…).
  const nouns = { teamNoun: sport.teamNoun.plural, teamNounOne: sport.teamNoun.singular, venueNoun: venues };

  if (!open) {
    return (
      <div className="grid gap-2">
        <Button
          variant={variant}
          aria-expanded={false}
          aria-controls={panelId}
          className="justify-self-start"
          onClick={() => {
            setTeams(form.maxTeams);
            setApplied(false);
            setOpen(true);
          }}
        >
          <Icon name="sparkle" size={20} />
          {t.open}
        </Button>
        {applied && (
          <p role="status" className="flex items-center gap-2 text-sm font-bold text-success">
            <Icon name="check" size={18} />
            {t.applied}
          </p>
        )}
      </div>
    );
  }

  const c = advice?.changes;
  const format = c?.format ?? form.format;
  const details = advice
    ? [
        c?.rounds ? fmt(t.rounds, { count: c.rounds }) : null,
        c?.consolation !== undefined ? (c.consolation ? t.consolationYes : t.consolationNo) : null,
        c?.venueCount !== undefined ? fmt(t.venuesChange, { count: c.venueCount, venues }) : null,
        sport.venue.usage === "parallel" ? fmt(t.venuesNeeded, { count: advice.plan.firstRoundVenuesNeeded, venues }) : null,
        fmt(t.matches, { count: advice.plan.totalMatches }),
        fmt(t.end, { time: hm(advice.plan.endTime) }),
      ].filter((x): x is string => Boolean(x))
    : [];

  return (
    <section id={panelId} aria-labelledby={`${panelId}-title`} className="grid gap-4 rounded-[var(--radius-lg)] border-2 border-accent bg-surface p-4">
      <h3 id={`${panelId}-title`} className="flex items-center gap-2 text-lg font-black">
        <Icon name="sparkle" size={20} className="text-accent-ink" />
        {t.title}
      </h3>
      <Stepper id={`${panelId}-teams`} label={fmt(t.expected, { teams: sport.teamNoun.plural })} value={teams} min={2} max={1024} onChange={setTeams} />
      {advice && (
        <div className="grid gap-3" aria-live="polite">
          <div className="grid gap-1">
            <p className="eyebrow">{t.proposal}</p>
            <p className="display text-3xl">{formatLabel(format)}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-ink-soft">
              {details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
          <ul className="grid gap-1.5 text-sm">
            {advice.reasons.map((r) => (
              <li key={r.key} className="flex items-start gap-2">
                <Icon name="check" size={16} className="mt-0.5 shrink-0 text-accent-ink" />
                {fmt(w.advice[r.key] ?? r.key, { ...nouns, ...r.values })}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                onApply(advice.changes);
                setApplied(true);
                setOpen(false);
              }}
            >
              <Icon name="check" size={20} />
              {t.accept}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t.keep}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
