"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Icon } from "@orgasport/ui";
import { switchProfile } from "@/app/(auth)/inscription/actions";
import { cn } from "@/components/ui/cn";

type Option = { id: string | null; label: string; sub?: string; icon: string };

/** Instagram-style switch between the player profile and managed clubs. */
export function ProfileSwitcher({ title, options, activeId }: { title: string; options: Option[]; activeId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <fieldset className="grid gap-2" disabled={pending}>
      <legend className="eyebrow mb-2">{title}</legend>
      {options.map((o) => {
        const active = o.id === activeId;
        return (
          <button
            key={o.id ?? "player"}
            type="button"
            aria-pressed={active}
            onClick={() =>
              start(async () => {
                const r = await switchProfile(o.id);
                if (r.ok) {
                  router.push(r.redirect);
                  router.refresh();
                }
              })
            }
            className={cn(
              "flex min-h-16 items-center gap-3 rounded-[var(--radius)] border-2 px-4 text-left",
              active ? "border-accent bg-accent-soft" : "border-line hover:border-ink-soft",
            )}
          >
            <span className={cn("grid size-10 place-items-center rounded-full", active ? "bg-accent text-on-accent" : "bg-surface-2")}>
              <Icon name={o.icon} size={20} />
            </span>
            <span className="grid flex-1">
              <span className="font-bold">{o.label}</span>
              {o.sub && <span className="text-sm text-ink-soft">{o.sub}</span>}
            </span>
            {active && <Icon name="check" className="text-accent-ink" />}
          </button>
        );
      })}
    </fieldset>
  );
}
