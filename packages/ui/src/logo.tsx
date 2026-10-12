import type { SVGProps } from "react";

/** Provisional mark: two slanted bars, the second one in the sport accent. */
export function LogoMark({ size = 32, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true" focusable="false" {...props}>
      <path d="M10 6 H24 L16 38 H2 Z" fill="currentColor" />
      <path d="M28 6 H42 L34 38 H20 Z" fill="var(--os-accent)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className} style={{ fontStyle: "italic", fontStretch: "75%", fontWeight: 800, textTransform: "uppercase", letterSpacing: "-0.01em" }}>
      Orga<span style={{ color: "var(--os-accent-ink)" }}>Sport</span>
    </span>
  );
}
