"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@orgasport/ui";
import { buttonClass } from "@/components/ui/Button";
import { useHydrated } from "./FilterForm";

type Texts = { button: string; locating: string; denied: string; unavailable: string };

/**
 * « Autour de moi »: asks the browser for the position (only on this tap,
 * never on page load), then reloads the catalog with lat/lng rounded to
 * ~1 km and sorted by distance. Hidden without JavaScript / geolocation.
 */
export function AroundMe({ action, query, texts, active }: { action: string; query: string; texts: Texts; active: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [state, setState] = useState<"idle" | "locating" | "denied" | "unavailable">("idle");
  const [navigating, startTransition] = useTransition();

  if (!hydrated || typeof navigator === "undefined" || !("geolocation" in navigator)) return null;

  function locate() {
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const q = new URLSearchParams(query);
        q.set("lat", pos.coords.latitude.toFixed(2));
        q.set("lng", pos.coords.longitude.toFixed(2));
        q.set("tri", "distance");
        setState("idle");
        startTransition(() => router.replace(`${action}?${q}`, { scroll: false }));
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  }

  const busy = state === "locating" || navigating;
  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={locate}
        disabled={busy}
        aria-pressed={active}
        className={buttonClass(active ? "inverse" : "outline", "md", "justify-self-start")}
      >
        <Icon name="target" size={20} />
        {busy ? texts.locating : texts.button}
      </button>
      {(state === "denied" || state === "unavailable") && (
        <p role="alert" className="text-sm text-danger">
          {state === "denied" ? texts.denied : texts.unavailable}
        </p>
      )}
    </div>
  );
}
