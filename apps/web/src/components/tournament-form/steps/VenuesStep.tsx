"use client";
import { useState } from "react";
import { venueLabel } from "@orgasport/sports";
import { Icon } from "@orgasport/ui";
import { fmt, getMessages } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { venueLabelsOf } from "@/lib/tournament-form";
import { Group, Help, Stepper, TextArea } from "../fields";
import { FormatAdvisor } from "../FormatAdvisor";
import { VenuePlan } from "../VenuePlan";
import { parseVenueNames, toggleReserved, venueNamesText } from "../venue-names";
import { fid, type StepProps } from "./types";

/** 6. Venues: how many, their names, the ones kept for the finals, and the live plan. */
export function VenuesStep({ form, sport, update, error, vars }: StepProps) {
  const w = getMessages().wizard;
  const t = w.venues;
  // The raw text keeps what is being typed (blank lines, trailing spaces).
  const [namesText, setNamesText] = useState(() => venueNamesText(form.venueLabels));
  const names = parseVenueNames(namesText);
  const labels = venueLabelsOf(form);
  const mismatch = names.length > 0 && names.length !== form.venueCount;

  return (
    <div className="grid gap-8">
      <Group title={fmt(t.count, vars)}>
        <Stepper id={fid("venueCount")} label={fmt(t.count, vars)} value={form.venueCount} min={1} max={500} error={error("venueCount")} onChange={(venueCount) => update({ venueCount })} />
        <TextArea
          id={fid("venueLabels")}
          label={`${t.names} (${w.optional})`}
          rows={4}
          value={namesText}
          hint={fmt(t.namesHint, { count: form.venueCount })}
          error={error("venueLabels")}
          onChange={(text) => {
            setNamesText(text);
            update({ venueLabels: parseVenueNames(text).slice(0, 500) });
          }}
        />
        {names.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <p className={cn("text-sm font-bold", mismatch ? "text-warning" : "text-ink-soft")}>
              {fmt(t.namesCount, { names: names.length, count: form.venueCount, venues: vars.venues! })}
            </p>
            {mismatch && names.length <= 500 && (
              <Button variant="outline" onClick={() => update({ venueCount: names.length })}>
                {fmt(t.useNamesCount, { count: names.length, venues: vars.venues! })}
              </Button>
            )}
          </div>
        )}
      </Group>

      <Group title={`${t.reserved} (${w.optional})`} text={fmt(t.reservedHint, vars)}>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t.reserved} aria-describedby={`${fid("reservedLabels")}-desc`}>
          {labels.map((label) => {
            const on = form.reservedLabels.includes(label);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                aria-label={`${venueLabel(sport)} ${label}`}
                onClick={() => update({ reservedLabels: toggleReserved(form.reservedLabels, label, labels) })}
                className={cn(
                  "inline-flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-[var(--radius)] border-2 px-3 font-bold tabular transition",
                  on ? "border-accent bg-accent text-on-accent" : "border-line bg-surface hover:border-ink-soft",
                )}
              >
                {on && <Icon name="trophy" size={16} />}
                {label}
              </button>
            );
          })}
        </div>
        <Help id={`${fid("reservedLabels")}-desc`} error={error("reservedLabels")} />
      </Group>

      <VenuePlan form={form} sport={sport} advisor={<FormatAdvisor form={form} sport={sport} variant="outline" onApply={(changes) => update(changes)} />} />
    </div>
  );
}
