"use client";
import { useActionState } from "react";
import { fmt, getMessages } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/components/ui/cn";
import { CheckField, SelectField } from "@/components/admin/fields";
import { refreshNews, saveNewsSource, testNewsSource, type NewsField } from "./actions";

const t = getMessages().feed.admin;

function errorText(code: string | undefined, status?: number): string | undefined {
  if (!code) return undefined;
  const text = code in t.errors ? t.errors[code as keyof typeof t.errors] : t.errors.server;
  return fmt(text, { status: status ?? "" });
}

function Result({ ok, children }: { ok: boolean | undefined; children: React.ReactNode }) {
  return (
    <p role="status" aria-live="polite" className={cn("min-h-6 text-sm font-bold", ok === false ? "text-danger" : "text-success")}>
      {children}
    </p>
  );
}

export type SourceValues = { id: string; name: string; feedUrl: string; siteUrl: string; sport: string; enabled: boolean };
export const EMPTY_SOURCE: SourceValues = { id: "", name: "", feedUrl: "", siteUrl: "", sport: "", enabled: true };

/** Create or edit a news source. Uncontrolled inputs: the form works before JavaScript has loaded. */
export function SourceForm({ values, sports }: { values: SourceValues; sports: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveNewsSource, null);
  const id = (f: string) => `news-${values.id || "new"}-${f}`;
  const err = (f: NewsField) => (state?.ok === false ? errorText(state.fields?.[f]) : undefined);
  // Show what was typed again after an error or an edit; a successful creation starts empty.
  const typed = state && (state.ok === false || values.id) ? state.input : undefined;
  const v = (f: NewsField) => typed?.[f] ?? values[f];
  const enabled = typed ? typed.enabled === "on" : values.enabled;

  return (
    <form action={action} className="grid gap-4" aria-busy={pending} noValidate>
      <input type="hidden" name="id" value={values.id} />
      <TextField id={id("name")} name="name" label={t.name} defaultValue={v("name")} error={err("name")} required maxLength={80} />
      <TextField
        id={id("feedUrl")}
        name="feedUrl"
        type="url"
        inputMode="url"
        label={t.feedUrl}
        hint={t.feedUrlHint}
        defaultValue={v("feedUrl")}
        error={err("feedUrl")}
        required
        maxLength={500}
      />
      <TextField
        id={id("siteUrl")}
        name="siteUrl"
        type="url"
        inputMode="url"
        label={`${t.siteUrl} (${getMessages().common.optional})`}
        defaultValue={v("siteUrl")}
        error={err("siteUrl")}
        maxLength={500}
      />
      <SelectField id={id("sport")} name="sport" label={t.sport} defaultValue={v("sport")} error={err("sport")} key={`sport-${v("sport")}`}>
        <option value="">{t.allSports}</option>
        {sports.map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.name}
          </option>
        ))}
      </SelectField>
      <CheckField id={id("enabled")} name="enabled" label={t.enabled} defaultChecked={enabled} key={`enabled-${enabled}`} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t.save}
        </Button>
        <Result ok={state?.ok}>{state?.ok ? t.saved : state ? errorText(state.error) : null}</Result>
      </div>
    </form>
  );
}

/** « Tester » : fetches the saved feed and says how many items it contains. */
export function TestButton({ sourceId }: { sourceId: string }) {
  const [state, action, pending] = useActionState(testNewsSource, null);
  return (
    <form action={action} className="grid gap-1" aria-busy={pending}>
      <input type="hidden" name="id" value={sourceId} />
      <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
        {pending ? t.testing : t.test}
      </Button>
      <Result ok={state?.ok}>
        {state?.ok
          ? state.found === 0
            ? t.testNone
            : `${fmt(t.testOk, { count: state.found })}${state.sample ? ` ${fmt(t.testSample, { title: state.sample })}` : ""}`
          : state
            ? errorText(state.error, state.status)
            : null}
      </Result>
    </form>
  );
}

/** Fetches every enabled source now (the cron does it every hour). */
export function RefreshButton() {
  const [state, action, pending] = useActionState(refreshNews, null);
  return (
    <form action={action} className="grid gap-1" aria-busy={pending}>
      <Button type="submit" variant="inverse" disabled={pending} className="justify-self-start">
        {pending ? t.refreshing : t.refresh}
      </Button>
      <Result ok={state?.ok}>
        {state?.ok ? fmt(t.refreshDone, { sources: state.sources, saved: state.saved, failed: state.failed }) : state ? errorText(state.error) : null}
      </Result>
    </form>
  );
}
