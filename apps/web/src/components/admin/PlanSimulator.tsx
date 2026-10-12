"use client";
import { useState } from "react";
import { fmt, getMessages } from "@/i18n";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { formatEuros } from "@/lib/format";
import { pickPlan, type PlanRow } from "@/lib/payments/quote";
import { SelectField } from "./fields";

export type SimulatorSport = { slug: string; name: string; defaultTeams: number };

/**
 * "Pétanque, 64 équipes → Lien concours, 29 €": runs the same pickPlan() as
 * the checkout on the plans shown in the page, so the admin sees the effect
 * of a change before a club does.
 */
export function PlanSimulator({ plans, sports }: { plans: PlanRow[]; sports: SimulatorSport[] }) {
  const t = getMessages().admin.plans;
  const [sportSlug, setSportSlug] = useState(sports[0]?.slug ?? "");
  const [teamsText, setTeamsText] = useState(String(sports[0]?.defaultTeams ?? 32));
  const sport = sports.find((s) => s.slug === sportSlug);
  const teams = Number(teamsText);
  const valid = sport && Number.isInteger(teams) && teams >= 2;
  const plan = valid ? pickPlan(plans, sport.slug, teams) : null;

  return (
    <Card className="grid gap-4">
      <h3 className="eyebrow">{t.tryTitle}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="simulator-sport"
          label={t.trySport}
          value={sportSlug}
          onChange={(e) => {
            const next = sports.find((s) => s.slug === e.target.value);
            setSportSlug(e.target.value);
            if (next) setTeamsText(String(next.defaultTeams));
          }}
        >
          {sports.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <TextField
          id="simulator-teams"
          label={t.tryTeams}
          inputMode="numeric"
          value={teamsText}
          onChange={(e) => setTeamsText(e.target.value.replace(/\D/g, "").slice(0, 5))}
        />
      </div>
      <output htmlFor="simulator-sport simulator-teams" aria-live="polite" className="text-lg font-bold">
        {valid &&
          (plan
            ? fmt(t.tryResult, { sport: sport.name, teams, plan: plan.label, price: formatEuros(plan.price_cents) })
            : fmt(t.tryNone, { sport: sport.name, teams }))}
      </output>
    </Card>
  );
}
