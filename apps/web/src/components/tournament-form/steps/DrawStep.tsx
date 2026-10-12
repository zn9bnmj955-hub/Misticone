"use client";
import { defaultForfeitScore } from "@orgasport/engine";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { ChoiceCard } from "@/components/ui/ChoiceCard";
import { defaultRounds, type TournamentForm } from "@/lib/tournament-form";
import { Choice, Group, Help, Stepper, Toggle } from "../fields";
import { FormatAdvisor } from "../FormatAdvisor";
import { hm } from "../display";
import { fid, type StepProps } from "./types";

type Criterion = TournamentForm["ranking"][number];

/** 5. How the competition runs: format, rounds, bracket, consolation, draw rules, end of games, scores, ranking. */
export function DrawStep({ form, sport, update, error }: StepProps) {
  const w = getMessages().wizard;
  const t = w.draw;
  const forfeit = defaultForfeitScore(sport.scoring as Parameters<typeof defaultForfeitScore>[0]);
  const scoring = sport.scoring;
  const needsRounds = form.format === "swiss" || form.format === "melee_rotation";
  const excluded = sport.ranking.criteria.filter((c) => !form.ranking.includes(c));

  const move = (i: number, by: -1 | 1) => {
    const next = [...form.ranking];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item!);
    update({ ranking: next });
  };

  return (
    <div className="grid gap-8">
      <Group title={t.format}>
        <div className="grid gap-3" role="radiogroup" aria-label={t.format} aria-describedby={`${fid("format")}-desc`}>
          {sport.competitionFormats.map((f) => (
            <ChoiceCard
              key={f}
              title={w.formats[f] ?? f}
              text={w.formatTexts[f]}
              selected={form.format === f}
              onSelect={() => update({ format: f, rounds: defaultRounds(f, form.maxTeams) })}
            />
          ))}
        </div>
        <Help id={`${fid("format")}-desc`} error={error("format")} />
        <FormatAdvisor form={form} sport={sport} onApply={(changes) => update(changes)} />
      </Group>

      {needsRounds && (
        <Group title={t.rounds}>
          <Stepper id={fid("rounds")} label={t.rounds} value={form.rounds ?? defaultRounds(form.format, form.maxTeams) ?? 4} min={1} max={30} error={error("rounds")} onChange={(rounds) => update({ rounds })} />
        </Group>
      )}

      {form.format === "single_elimination" && (
        <Group title={t.bracket}>
          <Choice<TournamentForm["bracketMode"]>
            label={t.bracket}
            wide
            value={form.bracketMode}
            options={[
              { value: "redraw", label: t.redraw, text: t.redrawText },
              { value: "fixed", label: t.fixed, text: t.fixedText },
            ]}
            onChange={(bracketMode) => update({ bracketMode })}
            error={error("bracketMode")}
          />
        </Group>
      )}

      {(form.format === "single_elimination" || form.format === "pools_then_bracket") && (
        <Group title={t.consolation}>
          <Toggle
            label={t.consolation}
            text={form.format === "pools_then_bracket" ? t.consolationPoolsText : t.consolationText}
            checked={form.consolation}
            onChange={(consolation) => update({ consolation })}
          />
          {form.consolation && form.format === "single_elimination" && (
            <Stepper
              id={fid("consolationFromRound")}
              label={t.consolationFromRound}
              value={form.consolationFromRound}
              min={1}
              max={10}
              error={error("consolationFromRound")}
              onChange={(consolationFromRound) => update({ consolationFromRound })}
            />
          )}
        </Group>
      )}

      {form.format === "pools_then_bracket" && (
        <Group title={t.pools} text={sport.defaults.poolSystem === "gsl" && form.poolSize === 4 ? t.poolGsl : undefined}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Stepper id={fid("poolSize")} label={t.poolSize} value={form.poolSize} min={3} max={8} error={error("poolSize")} onChange={(poolSize) => update({ poolSize, poolQualifiers: Math.min(form.poolQualifiers, poolSize - 1) })} />
            <Stepper
              id={fid("poolQualifiers")}
              label={t.poolQualifiers}
              value={form.poolQualifiers}
              min={1}
              max={Math.min(4, form.poolSize - 1)}
              error={error("poolQualifiers")}
              onChange={(poolQualifiers) => update({ poolQualifiers })}
            />
          </div>
        </Group>
      )}

      <Group title={t.rules} text={t.rulesText}>
        <Toggle label={t.avoidSameClub} checked={form.avoidSameClub} onChange={(avoidSameClub) => update({ avoidSameClub })} />
        <Toggle label={t.seeding} text={t.seedingText} checked={form.seeding} onChange={(seeding) => update({ seeding })} />
        <p className="text-sm text-ink-soft">{fmt(t.byes, { score: `${forfeit.winner}–${forfeit.loser}` })}</p>
      </Group>

      <Group title={t.gameEnd}>
        {scoring.mode === "points" && (
          <>
            <p className="font-bold">{fmt(t.pointsTarget, { target: scoring.target })}</p>
            <Toggle
              label={t.timeLimit}
              text={t.timeLimitText}
              checked={form.timeLimitMinutes != null}
              onChange={(on) => update({ timeLimitMinutes: on ? (scoring.timeLimitMinutes ?? sport.typicalMatchMinutes + 10) : null })}
            />
            {form.timeLimitMinutes != null && (
              <Stepper
                id={fid("timeLimitMinutes")}
                label={t.timeLimitMinutes}
                value={form.timeLimitMinutes}
                min={5}
                max={600}
                step={5}
                error={error("timeLimitMinutes")}
                onChange={(timeLimitMinutes) => update({ timeLimitMinutes })}
              />
            )}
          </>
        )}
        {scoring.mode === "time" && (
          <Stepper
            id={fid("durationMinutes")}
            label={t.duration}
            value={form.durationMinutes ?? scoring.durationMinutes}
            min={1}
            max={600}
            error={error("durationMinutes")}
            onChange={(durationMinutes) => update({ durationMinutes })}
          />
        )}
        {scoring.mode === "sets" && <p className="font-bold">{fmt(t.setsTarget, { sets: scoring.setsToWin, points: scoring.pointsPerSet })}</p>}
      </Group>

      <Group title={t.scoreEntry}>
        <Choice<TournamentForm["scoreEntry"]>
          label={t.scoreEntry}
          wide
          value={form.scoreEntry}
          options={[
            { value: "table", label: t.scoreEntryTable, text: t.scoreEntryTableText },
            { value: "captains", label: t.scoreEntryCaptains, text: t.scoreEntryCaptainsText },
          ]}
          onChange={(scoreEntry) => update({ scoreEntry })}
        />
        <Toggle label={t.autoDraw} text={fmt(t.autoDrawText, { time: hm(form.startTime) })} checked={form.autoDraw} onChange={(autoDraw) => update({ autoDraw })} />
      </Group>

      <Group title={t.ranking} text={t.rankingText}>
        <ol className="grid gap-2" aria-describedby={`${fid("ranking")}-desc`}>
          {form.ranking.map((c, i) => (
            <li key={c} className="flex min-h-12 items-center gap-2 rounded-[var(--radius)] border-2 border-line bg-surface pl-4">
              <span className="display w-6 text-2xl text-accent-ink tabular">{i + 1}</span>
              <span className="min-w-0 flex-1 font-bold">{w.criteria[c] ?? c}</span>
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${w.moveUp} : ${w.criteria[c]}`} className="grid size-12 place-items-center rounded-[var(--radius)] hover:bg-surface-2 disabled:opacity-30">
                <Icon name="arrowLeft" size={20} className="rotate-90" />
              </button>
              <button
                type="button"
                disabled={i === form.ranking.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`${w.moveDown} : ${w.criteria[c]}`}
                className="grid size-12 place-items-center rounded-[var(--radius)] hover:bg-surface-2 disabled:opacity-30"
              >
                <Icon name="arrowRight" size={20} className="rotate-90" />
              </button>
              <button
                type="button"
                disabled={form.ranking.length <= 1}
                onClick={() => update({ ranking: form.ranking.filter((x) => x !== c) })}
                aria-label={`${w.remove} : ${w.criteria[c]}`}
                className="grid size-12 place-items-center rounded-[var(--radius)] text-ink-soft hover:bg-surface-2 hover:text-ink disabled:opacity-30"
              >
                <Icon name="close" size={20} />
              </button>
            </li>
          ))}
        </ol>
        <Help id={`${fid("ranking")}-desc`} error={error("ranking")} />
        {excluded.length > 0 && (
          <div className="grid gap-2">
            <p className="text-sm font-bold">{t.rankingAdd}</p>
            <div className="flex flex-wrap gap-2">
              {excluded.map((c: Criterion) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => update({ ranking: [...form.ranking, c] })}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full border-2 border-dashed border-line px-4 font-bold text-ink-soft hover:border-ink-soft hover:text-ink"
                >
                  <Icon name="plus" size={18} />
                  {w.criteria[c] ?? c}
                </button>
              ))}
            </div>
          </div>
        )}
      </Group>
    </div>
  );
}
