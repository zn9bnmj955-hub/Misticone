"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@orgasport/ui";
import type { Place } from "@/lib/geocode";

export type PlaceValue = { text: string; city?: string; postcode?: string; lat?: number; lng?: number };

/**
 * Text field with suggestions from the state geocoding service. If the
 * service is unreachable, the typed text is kept as is.
 */
export function PlaceField({
  id,
  label,
  placeholder,
  kind,
  value,
  onChange,
  noResultText,
  offlineText,
}: {
  id: string;
  label: string;
  placeholder: string;
  kind: "city" | "address";
  value: PlaceValue;
  onChange: (v: PlaceValue) => void;
  noResultText: string;
  offlineText: string;
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "offline">("idle");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = value.text.trim();
    if (q.length < 3) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetch(`/api/geocode?kind=${kind}&q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const json = (await res.json()) as { places: Place[]; unavailable?: boolean };
        if (json.unavailable) {
          setState("offline");
          setResults([]);
          return;
        }
        setResults(json.places);
        setState(json.places.length ? "idle" : "empty");
        setOpen(true);
      } catch {
        if (!ctrl.signal.aborted) setState("offline");
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [value.text, kind]);

  function pick(p: Place) {
    skipNext.current = true;
    onChange({ text: kind === "city" ? `${p.city} (${p.postcode})` : p.label, city: p.city, postcode: p.postcode, lat: p.lat, lng: p.lng });
    setOpen(false);
    setResults([]);
  }

  return (
    <div className="relative grid gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <div className="relative">
        <Icon name="mapPin" size={22} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
        <input
          id={id}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          value={value.text}
          onChange={(e) => {
            if (e.target.value.trim().length < 3) {
              setResults([]);
              setState("idle");
            }
            onChange({ text: e.target.value });
          }}
          className="min-h-14 w-full rounded-[var(--radius)] border-2 border-line bg-surface pl-11 pr-4 text-lg text-ink placeholder:text-ink-soft/70 focus:border-accent"
        />
      </div>
      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            setOpen(false);
            document.getElementById(id)?.focus();
          }}
          className="absolute top-full z-10 mt-1 grid w-full overflow-hidden rounded-[var(--radius)] border border-line bg-surface shadow-[var(--shadow-pop)]">
          {results.map((p) => (
            <li key={`${p.label}-${p.lat}`} role="option" aria-selected={false}>
              <button type="button" onClick={() => pick(p)} className="flex min-h-12 w-full items-center gap-2 px-4 text-left hover:bg-surface-2">
                <span className="font-bold">{kind === "city" ? p.city : p.label}</span>
                {kind === "city" && <span className="text-sm text-ink-soft">{p.postcode}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {state === "empty" && <p className="text-sm text-ink-soft">{noResultText}</p>}
      {state === "offline" && <p className="text-sm text-ink-soft">{offlineText}</p>}
    </div>
  );
}
