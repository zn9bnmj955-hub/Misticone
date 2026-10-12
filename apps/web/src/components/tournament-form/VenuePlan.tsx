"use client";
import type { SportConfig } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { formatTime } from "@/lib/format";
import type { TournamentForm } from "@/lib/tournament-form";
import { hm, longDate } from "./display";
import { safePlan, summarizePlan } from "./plan";

/**
 * "64 équipes en élimination directe : 32 terrains nécessaires au 1er tour.
 * Vous en avez 20 : 12 parties démarreront en décalé. Fin estimée vers 21 h."
 * Sports that share a few venues in time slots get a timetable instead.
 */
export function VenuePlan({ form, sport, advisor }: { form: TournamentForm; sport: SportConfig; advisor?: React.ReactNode }) {
  const w = getMessages().wizard;
  const t = w.venues;
  const plan = safePlan(form, sport);
  if (!plan) return <p className="text-sm text-ink-soft">{t.noPlan}</p>;
  const s = summarizePlan(form, sport, plan);
  const vars = {
    teams: form.maxTeams,
    teamNoun: sport.teamNoun.plural,
    format: (w.formats[form.format] ?? form.format).toLowerCase(),
    venues: sport.venue.noun.plural,
    needed: s.needed,
    free: s.free,
    delayed: s.delayed,
    matches: s.matches,
    slots: s.slots,
    slot: s.slot,
  };
  const end = s.endsAnotherDay ? fmt(t.endNextDay, { day: longDate(s.endDate), time: hm(s.endTime) }) : fmt(t.end, { time: hm(s.endTime) });

  const counters = new Map<string, number>();
  const rounds = plan.rounds.map((r) => {
    const n = (counters.get(r.kind) ?? 0) + 1;
    counters.set(r.kind, n);
    return { ...r, label: fmt(t.roundKinds[r.kind] ?? r.kind, { n }) };
  });

  return (
    <div className="grid gap-3 rounded-[var(--radius-lg)] border-2 border-accent bg-accent-soft p-4">
      <p className="eyebrow">{t.plan}</p>
      {sport.venue.usage === "parallel" ? (
        <p className="text-lg" aria-live="polite">
          <strong>{fmt(t.parallelNeeded, vars)}</strong> {fmt(s.delayed > 0 ? t.parallelShort : t.parallelEnough, vars)}{" "}
          {s.reserved > 0 && <span className="text-ink-soft">{fmt(t.reservedNotCounted, { count: s.reserved })} </span>}
          <strong>{end}</strong>
        </p>
      ) : (
        <p className="text-lg" aria-live="polite">
          <strong>{fmt(t.scheduled, vars)}</strong> <strong>{end}</strong>
        </p>
      )}
      <p className="text-sm text-ink-soft">{fmt(t.planHint, vars)}</p>
      {s.late && (
        <p className="flex items-start gap-2 text-sm font-bold text-warning">
          <Icon name="clock" size={18} className="mt-0.5 shrink-0" />
          {fmt(t.late, vars)}
        </p>
      )}
      {advisor}
      <details className="text-sm">
        <summary className="min-h-12 cursor-pointer content-center font-bold">{t.details}</summary>
        <ol className="grid gap-1 tabular">
          {rounds.map((r) => (
            <li key={r.index}>{fmt(t.roundLine, { label: r.label, matches: r.matches, start: formatTime(r.start), end: formatTime(r.end) })}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
