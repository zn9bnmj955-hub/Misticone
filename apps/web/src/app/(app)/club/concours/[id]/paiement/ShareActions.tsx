"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@orgasport/ui";
import { getMessages } from "@/i18n";
import { Button, buttonClass } from "@/components/ui/Button";

const noSubscribe = () => () => {};

/** Short link with "copy", WhatsApp and the phone's own share sheet when there is one. */
export function ShareActions({ url, title, text }: { url: string; title: string; text: string }) {
  const m = getMessages().payment.result;
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(
    noSubscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // No clipboard access (old browser, http): select the text instead.
      input.current?.select();
    }
  }

  return (
    <div className="grid gap-3">
      <label htmlFor="short-link" className="sr-only">
        {m.shortLink}
      </label>
      <input
        ref={input}
        id="short-link"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="min-h-12 w-full min-w-0 rounded-[var(--radius)] border-2 border-line bg-surface-2 px-4 font-bold text-ink tabular focus:border-accent focus:outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={copy} aria-live="polite">
          {copied && <Icon name="check" size={20} />}
          {copied ? m.copied : m.copy}
        </Button>
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={buttonClass("outline")}>
          {m.shareWhatsApp}
        </a>
        {canShare && (
          <Button variant="outline" onClick={() => navigator.share({ title, text, url }).catch(() => undefined)}>
            {m.share}
          </Button>
        )}
      </div>
    </div>
  );
}
