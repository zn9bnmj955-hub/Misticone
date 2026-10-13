"use client";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { Icon } from "@orgasport/ui";
import { getMessages } from "@/i18n";
import { AssistantChat, type Prefill } from "./AssistantChat";
import { chatStore } from "./chat-store";

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * The bubble's chat window (loaded only when the bubble is first opened):
 * a sheet on mobile, a side panel on desktop. Modal: Escape closes, Tab
 * stays inside, the page behind does not scroll.
 */
export default function AssistantPanel({ onClose, prefill }: { onClose: () => void; prefill: Prefill }) {
  const m = getMessages().assistantUi;
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      // Closing stops the answer being written (the conversation stays).
      chatStore.stop();
    };
  }, [onClose]);

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden className="absolute inset-0 bg-ink/40 motion-safe:transition-opacity motion-safe:starting:opacity-0" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapTab}
        // Internal links navigate in place: the panel gets out of the way.
        onClick={(e) => {
          const a = (e.target as HTMLElement).closest("a");
          if (a && a.target !== "_blank") onClose();
        }}
        className="absolute inset-x-0 bottom-0 flex h-[88dvh] flex-col overflow-hidden rounded-t-[var(--radius-lg)] bg-surface text-ink shadow-[var(--shadow-pop)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:starting:translate-y-full lg:inset-y-0 lg:left-auto lg:h-dvh lg:w-[440px] lg:rounded-none lg:border-l lg:border-line lg:motion-safe:starting:translate-x-full lg:motion-safe:starting:translate-y-0"
      >
        <header className="flex items-center gap-1 border-b border-line py-1 pr-1 pl-4">
          <Icon name="sparkle" size={22} className="text-accent-ink" />
          <h2 id={titleId} className="display ml-1 flex-1 text-2xl">
            {m.title}
          </h2>
          <Link href="/assistant" className="inline-flex min-h-12 items-center rounded-[var(--radius)] px-3 text-sm font-bold text-ink hover:bg-surface-2">
            {m.fullPage}
          </Link>
          <button type="button" aria-label={m.close} onClick={onClose} className="grid size-12 place-items-center rounded-full text-ink hover:bg-surface-2">
            <Icon name="close" size={22} />
          </button>
        </header>
        <AssistantChat variant="panel" prefill={prefill} autoFocus />
      </div>
    </div>
  );
}
