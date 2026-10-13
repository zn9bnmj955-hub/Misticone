"use client";
import { useActionState } from "react";
import { fmt, getMessages } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { CheckField } from "@/components/admin/fields";
import { saveAiSettings } from "@/app/(app)/admin/assistant/actions";
import type { SettingsField } from "./forms";
import { ResultLine, errorText } from "./result";

const t = getMessages().adminAssistant;

export type SettingsValues = Record<SettingsField, string> & { enabled: boolean };

/**
 * Assistant settings (app_settings "ai.*"). Uncontrolled inputs: the form
 * works before JavaScript has loaded; after saving, it shows what was saved.
 */
export function SettingsForm({
  values,
  defaultModel,
  priceModel,
  defaultPrice,
}: {
  values: SettingsValues;
  defaultModel: string;
  /** Model whose price the override applies to (ANTHROPIC_MODEL wins over the stored model). */
  priceModel: string;
  /** Default price list of that model, or null when the model is unknown. */
  defaultPrice: { input: string; output: string; cache: string } | null;
}) {
  const [state, action, pending] = useActionState(saveAiSettings, null);
  const id = (f: string) => `ai-settings-${f}`;
  const err = (f: SettingsField) => (state?.ok === false ? errorText(state.fields?.[f]) : undefined);
  const typed = state?.input;
  const v = (f: SettingsField) => typed?.[f] ?? values[f];
  const enabled = typed ? typed.checked === "on" : values.enabled;
  const decimal = { inputMode: "decimal" as const, autoComplete: "off" };

  return (
    <form action={action} className="grid gap-5" aria-busy={pending} noValidate>
      <CheckField id={id("enabled")} name="enabled" label={t.settings.enabled} defaultChecked={enabled} key={`enabled-${enabled}`} />
      <TextField
        id={id("model")}
        name="model"
        label={t.settings.model}
        hint={err("model") ? undefined : fmt(t.settings.modelHint, { model: defaultModel })}
        defaultValue={v("model")}
        error={err("model")}
        placeholder={defaultModel}
        autoComplete="off"
        spellCheck={false}
        maxLength={100}
        required
      />

      <fieldset className="grid gap-3">
        <legend className="mb-1 font-bold">{t.settings.quotas}</legend>
        <p className="text-sm text-ink-soft">{t.settings.quotasHint}</p>
        <div className="grid grid-cols-3 items-start gap-3">
          {(
            [
              ["quotaGuest", t.settings.quotaGuest],
              ["quotaAccount", t.settings.quotaAccount],
              ["quotaPayingClub", t.settings.quotaPayingClub],
            ] as const
          ).map(([f, label]) => (
            <TextField
              key={f}
              id={id(f)}
              name={f}
              label={label}
              defaultValue={v(f)}
              error={err(f)}
              inputMode="numeric"
              autoComplete="off"
              className="tabular"
              required
            />
          ))}
        </div>
      </fieldset>

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <TextField
          id={id("budget")}
          name="budget"
          label={t.settings.budget}
          hint={err("budget") ? undefined : t.settings.budgetHint}
          defaultValue={v("budget")}
          error={err("budget")}
          required
          {...decimal}
        />
        <TextField
          id={id("usdToEur")}
          name="usdToEur"
          label={t.settings.usdToEur}
          hint={err("usdToEur") ? undefined : t.settings.usdToEurHint}
          defaultValue={v("usdToEur")}
          error={err("usdToEur")}
          required
          {...decimal}
        />
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-1 font-bold">{fmt(t.settings.price, { model: priceModel })}</legend>
        <p className="text-sm text-ink-soft">
          {defaultPrice ? fmt(t.settings.priceHint, defaultPrice) : fmt(t.settings.priceHintUnknown, { model: defaultModel })}
        </p>
        <div className="grid items-start gap-3 sm:grid-cols-3">
          {(
            [
              ["priceInput", t.settings.priceInput],
              ["priceOutput", t.settings.priceOutput],
              ["priceCacheRead", t.settings.priceCacheRead],
            ] as const
          ).map(([f, label]) => (
            <TextField key={f} id={id(f)} name={f} label={label} defaultValue={v(f)} error={err(f)} {...decimal} />
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? getMessages().admin.saving : t.settings.save}
        </Button>
        <ResultLine ok={state?.ok}>{state?.ok ? t.settings.saved : state ? errorText(state.error) : null}</ResultLine>
      </div>
    </form>
  );
}
