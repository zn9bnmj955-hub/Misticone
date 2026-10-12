"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@orgasport/ui";

const KEY = "os_recent";
type Recent = { code: string; name: string; at: number };

export function readRecent(): Recent[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Recent[];
    return Array.isArray(v) ? v.slice(0, 5) : [];
  } catch {
    return [];
  }
}

/** Remembers a tournament the person opened on this device. */
export function RememberDraw({ code, name }: { code: string; name: string }) {
  useEffect(() => {
    try {
      const list = [{ code, name, at: Date.now() }, ...readRecent().filter((r) => r.code !== code)].slice(0, 5);
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      // Storage unavailable (private mode): nothing to remember.
    }
  }, [code, name]);
  return null;
}

export function RecentDraws({ title }: { title: string }) {
  const [items, setItems] = useState<Recent[]>([]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read device storage after hydration
  useEffect(() => setItems(readRecent()), []);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="recent" className="grid gap-2">
      <h2 id="recent" className="eyebrow">
        {title}
      </h2>
      <ul className="grid gap-2">
        {items.map((r) => (
          <li key={r.code}>
            <Link href={`/c/${r.code}`} className="flex min-h-14 items-center gap-3 rounded-[var(--radius)] border border-line bg-surface px-4 hover:border-ink-soft">
              <span className="display text-xl tabular tracking-wider">{r.code}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
              <Icon name="arrowRight" size={20} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
