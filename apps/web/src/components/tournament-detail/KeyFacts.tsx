import { Suspense, type ReactNode } from "react";
import type { SportConfig } from "@orgasport/sports";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Section";
import { formatDay, formatEuros, formatTime } from "@/lib/format";
import type { TournamentDetail } from "@/app/(app)/concours/[code]/data";
import { PlacesGauge } from "./RegistrationBox";

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 grid gap-1" : "grid content-start gap-1"}>
      <dt className="eyebrow">{label}</dt>
      <dd className="font-bold">{children}</dd>
    </div>
  );
}

/** The key facts box: format, category, eligibility, fee, prize, places, deadlines. */
export function KeyFacts({ t, sport }: { t: TournamentDetail; sport: SportConfig }) {
  const m = getMessages();
  const f = m.detail.facts;
  const teamFormat = sport.teamFormats.find((x) => x.id === t.team_format)?.label;
  const fee =
    t.fee_cents > 0
      ? fmt(m.tournament.fee, { amount: formatEuros(t.fee_cents), per: t.fee_per === "player" ? m.tournament.perPlayer : m.tournament.perTeam })
      : m.tournament.free;
  const eligibility = t.eligibility === "licensed" ? m.tournament.licensed : t.eligibility === "mixed" ? m.tournament.mixed : m.tournament.open;
  const category = m.categoryLabels[t.category as keyof typeof m.categoryLabels] ?? t.category;

  return (
    <section aria-labelledby="facts-title" className="grid gap-3">
      <h2 id="facts-title" className="display text-3xl">
        {f.title}
      </h2>
      {t.welcome_message && (
        <figure className="grid gap-1 rounded-[var(--radius-lg)] border-l-4 border-accent bg-accent-soft px-4 py-3">
          <figcaption className="eyebrow">{f.welcome}</figcaption>
          <blockquote className="whitespace-pre-line text-lg font-semibold">{t.welcome_message}</blockquote>
        </figure>
      )}
      <Card>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          {teamFormat && <Fact label={f.teams}>{teamFormat}</Fact>}
          {t.format && <Fact label={f.format}>{m.formatLabels[t.format]}</Fact>}
          <Fact label={f.category}>{category}</Fact>
          <Fact label={f.eligibility}>
            <Badge tone={t.eligibility === "licensed" ? "warning" : "neutral"} className="text-sm">
              {eligibility}
            </Badge>
          </Fact>
          <Fact label={f.fee}>{fee}</Fact>
          {t.prize_text && <Fact label={f.prize}>{t.prize_text}</Fact>}
          <Fact label={f.registration}>
            {f.registrationMode[t.registration_mode]}
            {t.registration_closes_at && (
              <span className="block text-sm font-semibold text-ink-soft tabular">
                {fmt(f.closes, { date: formatDay(t.registration_closes_at), time: formatTime(t.registration_closes_at) })}
              </span>
            )}
          </Fact>
          {t.checkin_closes_at && (
            <Fact label={f.checkIn}>
              <span className="tabular">{fmt(f.checkInUntil, { time: formatTime(t.checkin_closes_at) })}</span>
            </Fact>
          )}
          <Fact label={f.places} wide>
            <Suspense fallback={<Skeleton className="h-10" />}>
              <PlacesGauge t={t} sport={sport} />
            </Suspense>
          </Fact>
        </dl>
      </Card>
    </section>
  );
}
