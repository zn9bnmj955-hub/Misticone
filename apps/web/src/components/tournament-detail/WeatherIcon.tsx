import type { ReactNode } from "react";
import type { WeatherKind } from "@/lib/weather";

/** Stroke icons in the style of the shared set (currentColor, 24px grid). */
const CLOUD = <path d="M7 17h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 10.1 3.5 3.5 0 0 0 7 17z" />;
const SMALL_CLOUD = <path d="M9 15h8a3.5 3.5 0 0 0 .4-6.97A5 5 0 0 0 8.1 9.1 3 3 0 0 0 9 15z" />;
const SUN_BEHIND = (
  <>
    <path d="M8.5 9.6A3.5 3.5 0 1 1 12 5.2" />
    <path d="M6 2.5v1.5M1.5 7H3M2.8 3.8l1 1M9.2 3.8l-1 1" />
  </>
);

const PATHS: Record<WeatherKind, ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  partly: (
    <>
      {SUN_BEHIND}
      {SMALL_CLOUD}
    </>
  ),
  cloud: CLOUD,
  rain: (
    <>
      <path d="M7 14h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 7.1 3.5 3.5 0 0 0 7 14z" />
      <path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3" />
    </>
  ),
  showers: (
    <>
      {SUN_BEHIND}
      {SMALL_CLOUD}
      <path d="M10 18l-1 2.5M14 18l-1 2.5" />
    </>
  ),
  snow: (
    <>
      <path d="M7 14h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 7.1 3.5 3.5 0 0 0 7 14z" />
      <path d="M8 18h.01M12 20h.01M16 18h.01M10 21h.01M14 21h.01" />
    </>
  ),
  fog: <path d="M4 8h16M2 12h20M5 16h14M8 20h8" />,
  storm: (
    <>
      <path d="M7 14h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 7.1 3.5 3.5 0 0 0 7 14z" />
      <path d="M13 14l-3 4h4l-2 4" />
    </>
  ),
};

export function WeatherIcon({ kind, size = 40 }: { kind: WeatherKind; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[kind]}
    </svg>
  );
}
