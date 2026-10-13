"use client";
import { useActionState } from "react";
import { getSport } from "@orgasport/sports";
import { fmt, getMessages } from "@/i18n";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/admin/fields";
import { testKbSearch } from "@/app/(app)/admin/assistant/actions";
import { ResultLine, errorText } from "./result";

const t = getMessages().adminAssistant;

/** Paragraphs are stored as "Title — text": the title is already shown above. */
function withoutTitle(content: string, title: string): string {
  const prefix = `${title} — `;
  return content.startsWith(prefix) ? content.slice(prefix.length) : content;
}

/** « Tester une question » : runs kb_search like the assistant does and shows what it would read. */
export function KbSearchBox({ sports }: { sports: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState(testKbSearch, null);
  const hits = state?.ok ? state.hits : [];

  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-4" aria-busy={pending} role="search" aria-label={t.search.title}>
        <p className="text-sm text-ink-soft">{t.search.hint}</p>
        <div className="grid items-start gap-4 sm:grid-cols-[1fr_auto]">
          <TextField
            id="kb-search-query"
            name="query"
            type="search"
            label={t.search.query}
            placeholder={t.search.placeholder}
            defaultValue={state?.query ?? ""}
            key={state?.query ?? ""}
            error={state?.ok === false && state.error === "query" ? errorText("query") : undefined}
            required
            minLength={2}
            maxLength={200}
          />
          <SelectField id="kb-search-sport" name="sport" label={t.search.sport} defaultValue="">
            <option value="">{t.search.allSports}</option>
            {sports.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? t.search.searching : t.search.submit}
          </Button>
          <ResultLine ok={state?.ok}>
            {state?.ok
              ? hits.length === 0
                ? t.search.none
                : hits.length === 1
                  ? t.search.resultsOne
                  : fmt(t.search.results, { count: hits.length })
              : state && state.error !== "query"
                ? errorText(state.error)
                : null}
          </ResultLine>
        </div>
      </form>
      {hits.length > 0 && (
        <ol className="grid gap-3">
          {hits.map((h, i) => {
            const sport = h.sport ? getSport(h.sport) : null;
            return (
              <li key={i} className="grid gap-2 rounded-[var(--radius)] border border-line bg-surface-2 p-4" data-sport={sport?.accentToken}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{h.title}</span>
                  <Badge tone={sport ? "accent" : "neutral"}>{sport?.name ?? t.kb.allSports}</Badge>
                  <span className="text-xs text-ink-soft tabular">{fmt(t.search.score, { score: h.rank.toFixed(2).replace(".", ",") })}</span>
                </div>
                <p className="whitespace-pre-line text-sm">{withoutTitle(h.content, h.title)}</p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
