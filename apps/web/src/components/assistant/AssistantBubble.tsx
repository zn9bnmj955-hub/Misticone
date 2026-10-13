"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@orgasport/ui";
import { MAX_CHARS, OPEN_EVENT } from "@/lib/assistant-client";
import type { Prefill } from "./AssistantChat";

const loadPanel = () => import("./AssistantPanel");
// The chat code is downloaded only when the bubble is opened (or about to be).
const AssistantPanel = dynamic(loadPanel, { ssr: false });

/**
 * Floating assistant button on every app page (not on /assistant itself).
 * Other code opens it with a question ready to send:
 * `window.dispatchEvent(new CustomEvent("os:assistant", { detail: { question } }))`.
 */
export function AssistantBubble({ label }: { label: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<Prefill>(null);
  const button = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const show = useCallback((question?: string) => {
    const active = document.activeElement;
    returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null;
    setPrefill(question ? { text: question.slice(0, MAX_CHARS), n: Date.now() } : null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    // Back to where the person was (the button, or the link that opened it).
    const target = returnTo.current?.isConnected ? returnTo.current : button.current;
    requestAnimationFrame(() => target?.focus());
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const q = (e as CustomEvent<{ question?: unknown }>).detail?.question;
      show(typeof q === "string" ? q.trim() : undefined);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [show]);

  if (pathname === "/assistant") return null;
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => show()}
        onPointerEnter={() => void loadPanel()}
        onFocus={() => void loadPanel()}
        className="fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-40 grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--shadow-pop)] ring-4 ring-bg transition hover:brightness-105 motion-safe:active:scale-95 lg:right-6 lg:bottom-6"
      >
        <Icon name="sparkle" size={26} />
      </button>
      {open && <AssistantPanel onClose={close} prefill={prefill} />}
    </>
  );
}
