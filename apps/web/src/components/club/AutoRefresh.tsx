"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server page every `seconds` while it is visible (live registration counts). */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
