"use client";
import { useSyncExternalStore } from "react";
import { buttonClass } from "@/components/ui/Button";
import { CopyButton } from "./CopyButton";
import { shareLinks } from "./links";

type Labels = { whatsapp: string; facebook: string; copy: string; copied: string; copyFailed: string; native: string; newTab: string };

const noSubscribe = () => () => {};
/** The system share sheet exists (phones): read after hydration, never on the server. */
function useCanShare(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );
}

/** WhatsApp, Facebook, copy link and, on phones, the system share sheet. */
export function ShareBar({ url, title, text, labels }: { url: string; title: string; text: string; labels: Labels }) {
  const canShare = useCanShare();
  const links = shareLinks(url, text);
  return (
    <div className="flex flex-wrap items-start gap-2">
      {canShare && (
        <button
          type="button"
          className={buttonClass("primary")}
          onClick={() => {
            navigator.share({ title, text, url }).catch(() => {
              // Cancelled by the person: nothing to do.
            });
          }}
        >
          {labels.native}
        </button>
      )}
      <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className={buttonClass("outline")}>
        {labels.whatsapp}
        <span className="sr-only"> {labels.newTab}</span>
      </a>
      <a href={links.facebook} target="_blank" rel="noopener noreferrer" className={buttonClass("outline")}>
        {labels.facebook}
        <span className="sr-only"> {labels.newTab}</span>
      </a>
      <CopyButton text={url} label={labels.copy} copiedLabel={labels.copied} failedLabel={labels.copyFailed} />
    </div>
  );
}
