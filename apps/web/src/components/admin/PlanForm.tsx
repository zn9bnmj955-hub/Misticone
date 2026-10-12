"use client";
import { useActionState } from "react";
import { getMessages } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { savePlan } from "@/app/(app)/admin/actions";
import { CheckField, FormResult, SelectField, errorText } from "./fields";
import type { PlanField } from "./forms";

export type PlanFormValues = {
  id: string;
  code: string;
  label: string;
  description: string;
  price: string;
  sport: string;
  maxTeams: string;
  active: boolean;
  sortOrder: string;
};

export const EMPTY_PLAN: PlanFormValues = {
  id: "",
  code: "",
  label: "",
  description: "",
  price: "",
  sport: "",
  maxTeams: "",
  active: true,
  sortOrder: "100",
};

/**
 * Create or edit a pricing plan. Uncontrolled inputs, so the form also works
 * before JavaScript has loaded.
 */
export function PlanForm({ values, sports }: { values: PlanFormValues; sports: { slug: string; name: string }[] }) {
  const t = getMessages().admin.plans;
  const [state, action, pending] = useActionState(savePlan, null);
  const err = (f: PlanField) => (state?.ok === false ? errorText(state.fields?.[f]) : undefined);
  const id = (f: PlanField) => `plan-${values.id || "new"}-${f}`;
  // Show what was typed again after an error or an edit (React resets the form after each action);
  // a successful creation starts from an empty form.
  const typed = state && (state.ok === false || values.id) ? state.input : undefined;
  const v = (f: Exclude<PlanField, "active">) => typed?.[f] ?? values[f];

  return (
    <form action={action} className="grid gap-4" aria-busy={pending} noValidate>
      <input type="hidden" name="id" value={values.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id={id("label")} name="label" label={t.fields.label} defaultValue={v("label")} error={err("label")} required maxLength={80} />
        <TextField
          id={id("code")}
          name="code"
          label={t.fields.code}
          hint={t.fields.codeHint}
          defaultValue={v("code")}
          error={err("code")}
          required
          maxLength={40}
          autoCapitalize="none"
          spellCheck={false}
        />
        <TextField
          id={id("price")}
          name="price"
          label={t.fields.price}
          hint={t.fields.priceHint}
          defaultValue={v("price")}
          error={err("price")}
          required
          inputMode="decimal"
        />
        <SelectField id={id("sport")} name="sport" label={t.fields.sport} defaultValue={v("sport")} error={err("sport")}>
          <option value="">{t.allSports}</option>
          {sports.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <TextField
          id={id("maxTeams")}
          name="maxTeams"
          label={t.fields.maxTeams}
          hint={t.fields.maxTeamsHint}
          defaultValue={v("maxTeams")}
          error={err("maxTeams")}
          inputMode="numeric"
        />
        <TextField
          id={id("sortOrder")}
          name="sortOrder"
          label={t.fields.sortOrder}
          hint={t.fields.sortOrderHint}
          defaultValue={v("sortOrder")}
          error={err("sortOrder")}
          inputMode="numeric"
        />
      </div>
      <TextField id={id("description")} name="description" label={t.fields.description} defaultValue={v("description")} error={err("description")} maxLength={300} />
      <CheckField id={id("active")} name="active" label={t.fields.active} defaultChecked={typed ? typed.active === "on" : values.active} />
      <div className="grid gap-2">
        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? getMessages().admin.saving : values.id ? t.submitSave : t.submitCreate}
        </Button>
        <FormResult state={state} />
      </div>
    </form>
  );
}
