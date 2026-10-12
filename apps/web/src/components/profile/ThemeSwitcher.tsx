"use client";
import { useEffect, useState } from "react";
import { Icon } from "@orgasport/ui";
import { cn } from "@/components/ui/cn";

type Theme = "system" | "light" | "dark";

export function ThemeSwitcher({ labels }: { labels: { title: string; system: string; light: string; dark: string } }) {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("os_theme");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read device preference after hydration
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
  }, []);

  function choose(t: Theme) {
    setTheme(t);
    const root = document.documentElement;
    try {
      if (t === "system") localStorage.removeItem("os_theme");
      else localStorage.setItem("os_theme", t);
    } catch {}
    if (t === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", t);
  }

  const options: { value: Theme; icon: string; label: string }[] = [
    { value: "system", icon: "monitor", label: labels.system },
    { value: "light", icon: "sun", label: labels.light },
    { value: "dark", icon: "moon", label: labels.dark },
  ];
  return (
    <fieldset className="grid gap-2">
      <legend className="eyebrow mb-2">{labels.title}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={theme === o.value}
            onClick={() => choose(o.value)}
            className={cn(
              "grid min-h-16 justify-items-center gap-1 rounded-[var(--radius)] border-2 p-2 text-sm font-bold",
              theme === o.value ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-soft hover:border-ink-soft",
            )}
          >
            <Icon name={o.icon} />
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
