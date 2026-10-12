import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "neutral" | "accent" | "live" | "success" | "warning";
const TONES: Record<Tone, string> = {
  neutral: "border-line text-ink-soft",
  accent: "border-transparent bg-accent-soft text-accent-ink",
  live: "border-transparent bg-live text-white",
  success: "border-transparent bg-success/15 text-success",
  warning: "border-transparent bg-warning/15 text-warning",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold", TONES[tone], className)}>
      {tone === "live" && <span className="live-dot bg-white" aria-hidden="true" />}
      {children}
    </span>
  );
}
