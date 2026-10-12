"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps the live parts of the page (registrants, places, status) fresh:
 * re-renders the server components every 30 s while the tab is visible, and
 * right away when the tournament broadcasts a change (Supabase Realtime,
 * channel `tournament:CODE`, event `update`). The Realtime client is loaded on
 * demand so it never weighs on the first display.
 */
export function LiveRefresh({ code, intervalMs = 30_000 }: { code: string; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe = () => {};
    const visible = () => document.visibilityState === "visible";
    const refresh = () => {
      if (visible()) router.refresh();
    };
    const soon = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(refresh, 800);
    };

    const timer = setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", soon);

    import("@/lib/supabase/client")
      .then(({ getBrowserClient }) => {
        if (cancelled) return;
        const supabase = getBrowserClient();
        const channel = supabase.channel(`tournament:${code}`).on("broadcast", { event: "update" }, soon).subscribe();
        unsubscribe = () => void supabase.removeChannel(channel);
      })
      .catch(() => {
        // Live updates are a bonus: the 30 s refresh keeps going.
      });

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (debounce) clearTimeout(debounce);
      document.removeEventListener("visibilitychange", soon);
      unsubscribe();
    };
  }, [code, intervalMs, router]);
  return null;
}
