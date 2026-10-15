"use client";
import { competitionFormatsFor } from "@orgasport/sports";
import { fmt, getMessages } from "@/i18n";
import { ChoiceCard } from "@/components/ui/ChoiceCard";
import { defaultRounds, type TournamentForm } from "@/lib/tournament-form";
import { categoryLabel } from "../display";
import { Choice, Group, Help, Stepper, Toggle } from "../fields";
import { fid, type StepProps } from "./types";

/** 3. Participants: team format, category, who may play, how many, how to register, names shown. */
export function ParticipantsStep({ form, sport, update, error }: StepProps) {
  const w = getMessages().wizard;
  const p = w.participants;
  const format = sport.teamFormats.find((f) => f.id === form.teamFormat);
  const teams = sport.teamNoun.plural;

  return (
    <div className="grid gap-8">
      <Group title={p.teamFormat}>
        <div className="grid gap-3" role="radiogroup" aria-label={p.teamFormat} aria-describedby={`${fid("teamFormat")}-desc`}>
          {sport.teamFormats.map((f) => (
            <ChoiceCard
              key={f.id}
              title={f.label}
              text={f.individualRegistration ? p.individual : fmt(p.players, { count: f.players })}
              selected={form.teamFormat === f.id}
              onSelect={() => {
                const substitutes = Math.min(f.substitutes.max, Math.max(f.substitutes.min, form.substitutes));
                // A drawn mêlée only fits the mêlée format, registered teams the others.
                const formats = competitionFormatsFor(sport, f.id);
                const format = formats.includes(form.format) ? form.format : formats.includes(sport.defaults.competitionFormat) ? sport.defaults.competitionFormat : formats[0]!;
                update(format === form.format ? { teamFormat: f.id, substitutes } : { teamFormat: f.id, substitutes, format, rounds: defaultRounds(format, form.maxTeams) });
              }}
            />
          ))}
        </div>
        <Help id={`${fid("teamFormat")}-desc`} error={error("teamFormat")} />
        {format && format.substitutes.max > 0 && (
          <Stepper
            id={fid("substitutes")}
            label={p.substitutes}
            value={form.substitutes}
            min={format.substitutes.min}
            max={format.substitutes.max}
            error={error("substitutes")}
            onChange={(substitutes) => update({ substitutes })}
          />
        )}
      </Group>

      <Group title={p.category}>
        <Choice
          label={p.category}
          value={form.category}
          options={sport.categories.map((c) => ({ value: c, label: categoryLabel(c) }))}
          onChange={(category) => update({ category })}
          error={error("category")}
        />
        <Choice
          label={p.eligibility}
          value={form.eligibility}
          options={(["open", "licensed", "mixed"] as const).map((e) => ({ value: e, label: w.eligibility[e]! }))}
          onChange={(eligibility) => update({ eligibility })}
          hint={sport.license.federation ? fmt(p.federationHint, { federation: sport.license.federation }) : undefined}
          error={error("eligibility")}
        />
      </Group>

      <Group title={fmt(p.maxTeams, { teams })}>
        <Stepper id={fid("maxTeams")} label={fmt(p.maxTeams, { teams })} value={form.maxTeams} min={2} max={1024} error={error("maxTeams")} onChange={(maxTeams) => update({ maxTeams })} />
        <Toggle label={p.waitlist} text={p.waitlistText} checked={form.waitlist} onChange={(waitlist) => update({ waitlist })} />
      </Group>

      <Group title={p.registrationMode}>
        <Choice<TournamentForm["registrationMode"]>
          label={p.registrationMode}
          value={form.registrationMode}
          options={(["both", "online", "onsite"] as const).map((m) => ({ value: m, label: w.registrationModes[m]! }))}
          onChange={(registrationMode) => update({ registrationMode })}
          error={error("registrationMode")}
        />
        <Choice<TournamentForm["nameDisplay"]>
          label={p.nameDisplay}
          value={form.nameDisplay}
          options={(["initials", "full"] as const).map((n) => ({ value: n, label: w.nameDisplays[n]!, text: w.nameDisplayHints[n] }))}
          onChange={(nameDisplay) => update({ nameDisplay })}
          error={error("nameDisplay")}
        />
      </Group>
    </div>
  );
}
