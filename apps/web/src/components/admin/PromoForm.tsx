"use client";
import { useActionState, useState } from "react";
import { getMessages } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/components/ui/cn";
import { savePromo } from "@/app/(app)/admin/actions";
import { CheckField, FormResult, errorText } from "./fields";
import type { PromoField, PromoKind } from "./forms";

export type PromoFormValues = {
  id: string;
  code: string;
  description: string;
  kind: PromoKind;
  percent: string;
  amount: string;
  maxRedemptions: string;
  validUntil: string;
  active: boolean;
};

export const EMPTY_PROMO: PromoFormValues = {
  id: "",
  code: "",
  description: "",
  kind: "percent",
  percent: "",
  amount: "",
  maxRedemptions: "",
  validUntil: "",
  active: true,
};

/**
 * Create or edit a promo code: a percentage OR a fixed amount (the database
 * refuses both). The code itself is chosen once, at creation.
 */
export function PromoForm({ values }: { values: PromoFormValues }) {
  const t = getMessages().admin.promos;
  const [state, action, pending] = useActionState(savePromo, null);
  const typed = state && (state.ok === false || values.id) ? state.input : undefined;
  const v = (f: Exclude<PromoField, "active" | "kind">) => typed?.[f] ?? values[f];
  const err = (f: PromoField) => (state?.ok === false ? errorText(state.fields?.[f]) : undefined);
  const id = (f: string) => `promo-${values.id || "new"}-${f}`;
  const [kind, setKind] = useState<PromoKind>(values.kind);
  const isNew = !values.id;

  return (
    <form action={action} className="grid gap-4" aria-busy={pending} noValidate>
      <input type="hidden" name="id" value={values.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        {isNew ? (
          <TextField
            id={id("code")}
            name="code"
            label={t.fields.code}
            hint={t.fields.codeHint}
            defaultValue={v("code")}
            error={err("code")}
            required
            maxLength={40}
            autoCapitalize="characters"
            spellCheck={false}
            className="sm:col-span-2"
          />
        ) : (
          <p className="text-sm text-ink-soft sm:col-span-2">{t.fields.codeFixed}</p>
        )}
        <fieldset className="grid gap-2 sm:col-span-2">
          <legend className="mb-1.5 text-sm font-bold">{t.fields.kind}</legend>
          <div className="flex flex-wrap gap-2">
            {(["percent", "amount"] as const).map((k) => (
              <label
                key={k}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-2 rounded-[var(--radius)] border-2 px-4 font-bold",
                  kind === k ? "border-accent bg-accent-soft" : "border-line",
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  className="size-5 accent-accent"
                />
                {k === "percent" ? t.fields.kindPercent : t.fields.kindAmount}
              </label>
            ))}
          </div>
          {err("kind") && <p className="text-sm text-danger">{err("kind")}</p>}
        </fieldset>
        {/* Both inputs stay in the form; only the chosen one is shown and read by the server. */}
        <div hidden={kind !== "percent"}>
          <TextField
            id={id("percent")}
            name="percent"
            label={t.fields.percent}
            hint={t.fields.percentHint}
            defaultValue={v("percent")}
            error={err("percent")}
            inputMode="numeric"
          />
        </div>
        <div hidden={kind !== "amount"}>
          <TextField
            id={id("amount")}
            name="amount"
            label={t.fields.amount}
            hint={t.fields.amountHint}
            defaultValue={v("amount")}
            error={err("amount")}
            inputMode="decimal"
          />
        </div>
        <TextField
          id={id("maxRedemptions")}
          name="maxRedemptions"
          label={t.fields.maxRedemptions}
          hint={t.fields.maxRedemptionsHint}
          defaultValue={v("maxRedemptions")}
          error={err("maxRedemptions")}
          inputMode="numeric"
        />
        <TextField
          id={id("validUntil")}
          name="validUntil"
          type="date"
          label={t.fields.validUntil}
          hint={t.fields.validUntilHint}
          defaultValue={v("validUntil")}
          error={err("validUntil")}
        />
      </div>
      <TextField id={id("description")} name="description" label={t.fields.description} defaultValue={v("description")} error={err("description")} maxLength={200} />
      <CheckField id={id("active")} name="active" label={t.fields.active} defaultChecked={typed ? typed.active === "on" : values.active} />
      <div className="grid gap-2">
        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? getMessages().admin.saving : isNew ? t.submitCreate : t.submitSave}
        </Button>
        <FormResult state={state} />
      </div>
    </form>
  );
}
