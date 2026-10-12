"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@orgasport/ui";
import { ALL_SPORTS, SPORT_COOKIE } from "@/lib/prefs";
import { setDeviceCookie } from "@/lib/cookies-client";

type SportChip = { slug: string; name: string; icon: string; accentToken: string };

/**
 * Story-style row of sport chips. The active chip is styled from the
 * <html data-sport> attribute (set before paint), so the right chip is
 * highlighted immediately even before React hydrates.
 */
export function SportSelector({ sports, allLabel, label }: { sports: SportChip[]; allLabel: string; label: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState<string>(ALL_SPORTS);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${SPORT_COOKIE}=([^;]+)`));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with cookie after hydration
    if (m?.[1]) setCurrent(m[1]);
  }, []);

  function choose(slug: string, accentToken: string | null) {
    setCurrent(slug);
    setDeviceCookie(SPORT_COOKIE, slug);
    const root = document.documentElement;
    if (accentToken) root.setAttribute("data-sport", accentToken);
    else root.removeAttribute("data-sport");
    startTransition(() => router.refresh());
  }

  const chips = [{ slug: ALL_SPORTS, name: allLabel, icon: "all", accentToken: "" }, ...sports];
  // Active chip is styled from <html data-sport>, generated for every sport.
  const css = chips
    .map((s) => {
      const root = s.accentToken ? `:root[data-sport="${s.accentToken}"]` : ":root:not([data-sport])";
      return `${root} .sport-chip[data-chip="${s.slug}"] .sport-chip-ring{border-color:var(--os-accent);background:var(--os-accent);color:var(--os-on-accent);box-shadow:0 0 0 3px var(--os-bg) inset}${root} .sport-chip[data-chip="${s.slug}"] .sport-chip-label{color:var(--os-ink)}`;
    })
    .join("");

  return (
    <div role="group" aria-label={label} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <style>{css}</style>
      <div className="flex w-max gap-4 pb-1">
        {chips.map((s) => {
          return (
            <button
              key={s.slug}
              type="button"
              aria-pressed={current === s.slug}
              data-chip={s.slug}
              onClick={() => choose(s.slug, s.accentToken || null)}
              className="sport-chip group grid w-16 justify-items-center gap-1.5 text-xs font-bold text-ink-soft"
            >
              <span className="sport-chip-ring grid size-14 place-items-center rounded-full border-2 border-line bg-surface text-ink transition">
                <Icon name={s.icon} size={26} />
              </span>
              <span className="sport-chip-label truncate">{s.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
