import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import script from "./data/script.json";

export { script };
export const FPS = 30;

/**
 * Colors of the site (packages/ui/src/tokens.css, dark theme + sport accents).
 * Videos always use the dark « stage » palette, like the 3D scenes of the site.
 */
export const C = {
  stage: "#070c24",
  cobalt: "#0b1640",
  surface: "#0f1736",
  surface2: "#17214a",
  ink: "#eef1ff",
  inkSoft: "#9aa3cf",
  line: "#26305e",
  blue: "#2f54ff",
  blueSoft: "#6f8bff",
  blueInk: "#8ea4ff",
  amber: "#ffb020",
  amberInk: "#ffc24d",
  green: "#00d68f",
  greenInk: "#2bf0a6",
  live: "#ff4d42",
  liveDeep: "#e5261d",
  success: "#3ddc8a",
  warning: "#ffb547",
  white: "#ffffff",
} as const;

export const FONT = "Saira, system-ui, sans-serif";
/** Very bold condensed titles (direction C « Direct »). */
export const TITLE = { fontFamily: FONT, fontWeight: 800, fontStretch: "75%", letterSpacing: "-0.01em" } as const;
export const NUM = { fontVariantNumeric: "tabular-nums" } as const;

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

/** 0 → 1 between two times (seconds), eased. */
export function ramp(t: number, from: number, to: number, ease: "out" | "inOut" | "linear" = "out") {
  return interpolate(t, [from, to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease === "out" ? EASE : ease === "inOut" ? EASE_IN_OUT : undefined,
  });
}
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** Linear interpolation of hex colors. */
export function mixColor(a: string, b: string, k: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const c = (s: number) => Math.round(mix(ch(pa, s), ch(pb, s), k));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

/** Current time in seconds inside the current <Sequence>. */
export function useTime() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
}

/** Layout information: the vertical videos reuse the scenes with their own layout. */
export function useLayout() {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  return { vertical, width, height, s: vertical ? width / 720 : height / 720 };
}

/** Deterministic pseudo-random numbers (no Math.random in renders). */
export function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const SHOTS = {
  decouverte: script.decouverte.shots,
  tutoriel: script.tutoriel.shots,
};
