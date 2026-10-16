import { fmt, getMessages } from "@/i18n";
import { cn } from "@/components/ui/cn";

/**
 * What a volunteer PIN is, in one sentence and three steps (create, give, type).
 * Shown where the organizer creates PINs and on the PIN entry screen.
 * No hooks: usable from server and client components.
 */
export function PinHelp({ audience, tableUrl, className }: { audience: "organizer" | "volunteer"; tableUrl?: string; className?: string }) {
  const t = getMessages().pinHelp;
  const id = `pin-help-${audience}`;
  return (
    <section aria-labelledby={id} className={cn("@container grid min-w-0 gap-3 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-4", className)}>
      <h2 id={id} className="text-lg font-black">
        {t.title}
      </h2>
      <p className="text-ink-soft">{t[audience]}</p>
      <ol aria-label={t.stepsLabel} className="grid gap-2 @2xl:grid-cols-3">
        {t.steps.map((step, i) => (
          <li key={step.title} className="flex min-w-0 items-start gap-3 rounded-[var(--radius)] bg-surface p-3">
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent font-black text-on-accent tabular">
              {i + 1}
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className="font-bold">{step.title}</span>
              <span className="text-sm break-words text-ink-soft">{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
      {tableUrl && <p className="break-all text-sm text-ink-soft">{fmt(t.tableLink, { url: tableUrl })}</p>}
    </section>
  );
}
