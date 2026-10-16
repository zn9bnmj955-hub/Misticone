"use client";
import { useActionState, useRef, useState } from "react";
import { fmt, getMessages } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/components/ui/cn";
import { CheckField, SelectField } from "@/components/admin/fields";
import { saveKbDocument } from "@/app/(app)/admin/assistant/actions";
import { KB_BODY_MAX, countParagraphs, type KbField } from "./forms";
import { ResultLine, errorText } from "./result";

const t = getMessages().adminAssistant;

export type KbValues = Record<KbField, string> & { id: string; published: boolean };
export const EMPTY_KB: KbValues = {
  id: "",
  title: "",
  sport: "",
  sourceUrl: "",
  kind: "help",
  versionDate: "",
  reviewedAt: "",
  body: "",
  published: true,
};

const paragraphsText = (n: number) => (n === 1 ? t.kb.paragraphsLiveOne : fmt(t.kb.paragraphsLive, { count: n }));

/** Create or edit a knowledge document. Uncontrolled inputs: the form works before JavaScript has loaded. */
export function KbForm({ values, sports }: { values: KbValues; sports: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveKbDocument, null);
  const prefix = `kb-${values.id || "new"}`;
  const id = (f: string) => `${prefix}-${f}`;
  const err = (f: KbField) => (state?.ok === false ? errorText(state.fields?.[f]) : undefined);
  // Show what was typed again after an error or an edit; a successful creation starts empty.
  const typed = state && (state.ok === false || values.id) ? state.input : undefined;
  const v = (f: KbField) => typed?.[f] ?? values[f];
  const published = typed ? typed.checked === "on" : values.published;

  // Live paragraph count (the database cuts the text at blank lines).
  const body = useRef<HTMLTextAreaElement>(null);
  const [paragraphs, setParagraphs] = useState(() => countParagraphs(v("body")));
  const recount = () => setParagraphs(countParagraphs(body.current?.value ?? ""));
  const bodyError = err("body");

  return (
    <form
      action={action}
      className="grid gap-4"
      aria-busy={pending}
      noValidate
      // "reset" fires before the fields are emptied: count once they are.
      onReset={() => setTimeout(recount, 0)}
    >
      <input type="hidden" name="id" value={values.id} />
      <TextField id={id("title")} name="title" label={t.kb.docTitle} defaultValue={v("title")} error={err("title")} required maxLength={200} />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <SelectField id={id("sport")} name="sport" label={t.kb.sport} defaultValue={v("sport")} error={err("sport")} key={`sport-${v("sport")}`}>
          <option value="">{t.kb.allSports}</option>
          {sports.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <TextField
          id={id("sourceUrl")}
          name="sourceUrl"
          type="url"
          inputMode="url"
          label={`${t.kb.sourceUrl} (${getMessages().common.optional})`}
          defaultValue={v("sourceUrl")}
          error={err("sourceUrl")}
          maxLength={500}
        />
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-3">
        <SelectField id={id("kind")} name="kind" label={t.kb.kind} defaultValue={v("kind")} error={err("kind")} key={`kind-${v("kind")}`}>
          <option value="help">{t.kb.kindHelp}</option>
          <option value="rules">{t.kb.kindRules}</option>
        </SelectField>
        <TextField
          id={id("versionDate")}
          name="versionDate"
          type="date"
          label={t.kb.versionDate}
          hint={t.kb.versionDateHint}
          defaultValue={v("versionDate")}
          error={err("versionDate")}
        />
        <TextField
          id={id("reviewedAt")}
          name="reviewedAt"
          type="date"
          label={t.kb.reviewedAt}
          hint={t.kb.reviewedAtHint}
          defaultValue={v("reviewedAt")}
          error={err("reviewedAt")}
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={id("body")} className="text-sm font-bold">
          {t.kb.body}
        </label>
        <textarea
          ref={body}
          id={id("body")}
          name="body"
          defaultValue={v("body")}
          onChange={recount}
          rows={10}
          maxLength={KB_BODY_MAX}
          required
          aria-invalid={bodyError ? true : undefined}
          aria-describedby={`${id("body")}-desc ${id("body")}-count`}
          className="min-h-40 w-full rounded-[var(--radius)] border-2 border-line bg-surface px-4 py-3 text-base text-ink focus:border-accent aria-[invalid]:border-danger"
        />
        <p id={`${id("body")}-desc`} className={cn("text-sm", bodyError ? "text-danger" : "text-ink-soft")}>
          {bodyError ?? t.kb.bodyHint}
        </p>
        <p id={`${id("body")}-count`} className="text-sm font-bold text-ink-soft tabular">
          {paragraphsText(paragraphs)}
        </p>
      </div>
      <CheckField id={id("published")} name="published" label={t.kb.publishField} defaultChecked={published} key={`published-${published}`} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? getMessages().admin.saving : t.kb.save}
        </Button>
        <ResultLine ok={state?.ok}>{state?.ok ? t.kb.saved : state ? errorText(state.error) : null}</ResultLine>
      </div>
    </form>
  );
}
