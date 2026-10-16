"use client";
import { useActionState, useState } from "react";
import { Icon } from "@orgasport/ui";
import { getMessages } from "@/i18n";
import { cn } from "@/components/ui/cn";
import { Button } from "@/components/ui/Button";
import { startDraft } from "@/app/(app)/club/concours/actions";

export type SportOption = { slug: string; name: string; icon: string; accentToken: string };

/**
 * Step 0: big sport cards. Each card is a submit button, so creating the
 * draft also works before JavaScript has loaded. With a single sport offered
 * (pétanque only), the choice is hidden: one « Créer le concours » button.
 */
export function SportPicker({ groups }: { groups: { title: string; sports: SportOption[] }[] }) {
  const t = getMessages().wizard.start;
  const [state, action, pending] = useActionState(startDraft, null);
  const [picked, setPicked] = useState<string | null>(null);
  const all = groups.flatMap((g) => g.sports);

  if (all.length === 1) {
    const only = all[0]!;
    return (
      <form action={action} className="grid gap-3" aria-busy={pending}>
        <input type="hidden" name="sport" value={only.slug} />
        <Button type="submit" size="lg" disabled={pending} data-sport={only.accentToken} className="justify-self-start">
          {pending ? t.creating : t.startSingle}
          <Icon name="arrowRight" />
        </Button>
        {state && !state.ok && (
          <p role="alert" className="font-bold text-danger">
            {t.errors[state.error] ?? getMessages().common.error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form action={action} className="grid gap-6" aria-busy={pending}>
      {groups.map((g) => (
        <fieldset key={g.title} className="grid gap-3" disabled={pending}>
          <legend className="eyebrow mb-3">{g.title}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.sports.map((s) => (
              <button
                key={s.slug}
                type="submit"
                name="sport"
                value={s.slug}
                data-sport={s.accentToken}
                onClick={() => setPicked(s.slug)}
                className={cn(
                  "group flex min-h-24 items-center gap-4 rounded-[var(--radius-lg)] border-2 border-line bg-surface p-4 text-left transition hover:border-accent",
                  "disabled:cursor-wait",
                  pending && picked === s.slug && "border-accent bg-accent-soft",
                )}
              >
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                  <Icon name={s.icon} size={30} />
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="display text-3xl">{s.name}</span>
                  {pending && picked === s.slug && <span className="text-sm font-bold text-ink-soft">{t.creating}</span>}
                </span>
                <Icon name="arrowRight" className="shrink-0 text-ink-soft transition group-hover:translate-x-1 group-hover:text-ink" />
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      {state && !state.ok && (
        <p role="alert" className="font-bold text-danger">
          {t.errors[state.error] ?? getMessages().common.error}
        </p>
      )}
    </form>
  );
}
