"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@orgasport/ui";
import { buttonClass } from "@/components/ui/Button";

/** Copies a text (address, link) in one tap, with spoken feedback. */
export function CopyButton({
  text,
  label,
  copiedLabel,
  failedLabel,
  className,
}: {
  text: string;
  label: string;
  copiedLabel: string;
  failedLabel: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <span className="inline-grid gap-1">
      <button type="button" onClick={copy} className={buttonClass("outline", "md", className)}>
        {state === "copied" && <Icon name="check" size={18} />}
        {state === "copied" ? copiedLabel : label}
      </button>
      <span aria-live="polite" className="text-xs text-ink-soft">
        {state === "failed" ? failedLabel : ""}
      </span>
    </span>
  );
}
