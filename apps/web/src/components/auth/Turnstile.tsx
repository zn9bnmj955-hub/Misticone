"use client";
import { useEffect, useRef } from "react";
import { env } from "@/lib/env";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; language?: string }) => string };
  }
}

/** Cloudflare Turnstile anti-bot check. Renders nothing when no site key is configured. */
export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!env.turnstileSiteKey || !ref.current) return;
    const el = ref.current;
    const render = () => window.turnstile?.render(el, { sitekey: env.turnstileSiteKey, callback: onToken, language: "fr" });
    if (window.turnstile) return void render();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [onToken]);
  if (!env.turnstileSiteKey) return null;
  return <div ref={ref} />;
}
