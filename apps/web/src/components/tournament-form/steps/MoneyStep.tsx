"use client";
import { useState } from "react";
import { getMessages } from "@/i18n";
import { Note } from "@/components/ui/Section";
import { TextField } from "@/components/ui/TextField";
import { Choice, Group } from "../fields";
import { eurosInput, parseEuros } from "../money";
import { fid, type StepProps } from "./types";

/** 4. Money: entry fee (paid on site for now) and prizes. */
export function MoneyStep({ form, update, error }: StepProps) {
  const w = getMessages().wizard;
  const t = w.money;
  // The text is kept while typing ("10," is not a number yet).
  const [feeText, setFeeText] = useState<string | null>(null);
  const typedInvalid = feeText !== null && parseEuros(feeText) === null;

  return (
    <div className="grid gap-8">
      <Group title={t.fee}>
        <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-start">
          <TextField
            id={fid("feeCents")}
            label={`${t.amount} (${t.euros})`}
            inputMode="decimal"
            autoComplete="off"
            value={feeText ?? eurosInput(form.feeCents)}
            hint={t.feeHint}
            error={typedInvalid ? w.issues.byPath.feeCents : error("feeCents")}
            onFocus={() => setFeeText(eurosInput(form.feeCents))}
            onChange={(e) => {
              setFeeText(e.target.value);
              const cents = parseEuros(e.target.value);
              if (cents !== null) update({ feeCents: cents });
            }}
            onBlur={() => setFeeText(null)}
          />
          <Choice
            label={t.feePer}
            value={form.feePer}
            options={[
              { value: "team" as const, label: t.perTeam },
              { value: "player" as const, label: t.perPlayer },
            ]}
            onChange={(feePer) => update({ feePer })}
            error={error("feePer")}
          />
        </div>
        <Note>{t.onsite}</Note>
      </Group>

      <Group title={`${t.prize} (${w.optional})`}>
        <TextField id={fid("prizeText")} label={t.prize} placeholder={t.prizePlaceholder} maxLength={200} value={form.prizeText} error={error("prizeText")} onChange={(e) => update({ prizeText: e.target.value })} />
      </Group>
    </div>
  );
}
