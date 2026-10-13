import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { C, FONT, NUM, TITLE, clamp01, mix, rand, ramp, useLayout, useTime } from "../theme";

/* ------------------------------------------------------------------------ */
/* Shots and transitions                                                     */
/* ------------------------------------------------------------------------ */

const OVERLAP = 0.5;

/**
 * One shot of a video, in seconds. The shot stays visible OVERLAP seconds after
 * its end, under the next one which fades in with a short zoom + blur.
 */
export function Shot({ from, to, children, first }: { from: number; to: number; children: React.ReactNode; first?: boolean }) {
  const { fps } = useVideoConfig();
  return (
    <Sequence from={Math.round(from * fps)} durationInFrames={Math.round((to - from + OVERLAP) * fps)}>
      <ShotIn first={first}>{children}</ShotIn>
    </Sequence>
  );
}

function ShotIn({ children, first }: { children: React.ReactNode; first?: boolean }) {
  const t = useTime();
  const k = first ? 1 : ramp(t, 0, OVERLAP, "inOut");
  const style: React.CSSProperties =
    k >= 1
      ? {}
      : { opacity: k, transform: `scale(${mix(1.06, 1, k)})`, filter: `blur(${mix(10, 0, k).toFixed(2)}px)` };
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
}

/* ------------------------------------------------------------------------ */
/* Typography                                                                */
/* ------------------------------------------------------------------------ */

type Words = Array<string | { text: string; color: string }>;

/** Words arrive one by one: slide up + blur that clears. */
export function Kinetic({
  words,
  at = 0,
  out,
  size,
  color = C.ink,
  stagger = 0.07,
  style,
  align = "left",
}: {
  words: Words | string;
  at?: number;
  out?: number;
  size: number;
  color?: string;
  stagger?: number;
  style?: React.CSSProperties;
  align?: "left" | "center";
}) {
  const t = useTime();
  const list: Words = typeof words === "string" ? words.split(" ") : words;
  const exit = out === undefined ? 0 : ramp(t, out, out + 0.4, "inOut");
  return (
    <div
      style={{
        ...TITLE,
        fontSize: size,
        lineHeight: 1.02,
        color,
        textAlign: align,
        opacity: 1 - exit,
        transform: `translateY(${-exit * 20}px)`,
        ...style,
      }}
    >
      {list.map((w, i) => {
        const text = typeof w === "string" ? w : w.text;
        const k = ramp(t, at + i * stagger, at + i * stagger + 0.55);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              color: typeof w === "string" ? undefined : w.color,
              opacity: k,
              transform: `translateY(${(1 - k) * 0.5}em)`,
              filter: k < 1 ? `blur(${((1 - k) * 12).toFixed(2)}px)` : undefined,
            }}
          >
            {text}
            {i < list.length - 1 ? " " : ""}
          </span>
        );
      })}
    </div>
  );
}

/** Title of a shot, placed for the current layout (bottom-left in 16:9, top in 9:16). */
export function Caption({
  words,
  at = 0.35,
  out,
  eyebrow,
  accent = C.blueSoft,
  place,
  stagger,
  size,
}: {
  words: Words | string;
  at?: number;
  out?: number;
  eyebrow?: string;
  accent?: string;
  place?: "bottom" | "top" | "left" | "leftTop" | "center";
  stagger?: number;
  size?: number;
}) {
  const t = useTime();
  const { vertical } = useLayout();
  const where = place ?? (vertical ? "top" : "bottom");
  const bar = ramp(t, at - 0.2, at + 0.4);
  const exit = out === undefined ? 0 : ramp(t, out, out + 0.4, "inOut");
  const pos: React.CSSProperties =
    where === "top"
      ? { left: 48, right: 48, top: 130 }
      : where === "left"
        ? { left: 80, width: 520, top: 0, bottom: 0, justifyContent: "center" }
        : where === "leftTop"
          ? { left: 80, width: 540, top: 150 }
          : where === "center"
          ? { left: 60, right: 60, top: 0, bottom: 0, justifyContent: "center", alignItems: "center" }
          : { left: 72, right: 72, bottom: 64 };
  return (
    <div style={{ position: "absolute", display: "flex", flexDirection: "column", ...pos }}>
      {eyebrow ? (
        <div
          style={{
            ...TITLE,
            fontSize: vertical ? 30 : 24,
            color: accent,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 12,
            opacity: bar * (1 - exit),
          }}
        >
          {eyebrow}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {where !== "center" ? (
          <div
            style={{
              width: 8,
              borderRadius: 4,
              background: accent,
              marginRight: 22,
              transform: `scaleY(${bar * (1 - exit)})`,
              transformOrigin: "top",
              boxShadow: `0 0 24px ${accent}`,
            }}
          />
        ) : null}
        <Kinetic
          words={words}
          at={at}
          out={out}
          size={size ?? (vertical ? 70 : where === "left" || where === "leftTop" ? 64 : 60)}
          stagger={stagger}
          align={where === "center" ? "center" : "left"}
          style={{ textShadow: "0 4px 30px rgba(4,6,12,0.9)" }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Backdrop: the boulodrome, drawn in CSS (cheap) for the interface shots    */
/* ------------------------------------------------------------------------ */

export function Backdrop({ accent = C.blueSoft, speed = 1, glow = 1 }: { accent?: string; speed?: number; glow?: number }) {
  const t = useTime();
  const { vertical, width, height } = useLayout();
  const cellW = 150;
  const cellH = 260;
  const shift = (t * 40 * speed) % cellH;
  const cols = 14;
  const rows = 9;
  const rects: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + 22;
      const y = r * cellH + 20;
      rects.push(<rect key={`${r}-${c}`} x={x} y={y} width={cellW - 44} height={cellH - 40} rx={4} />);
    }
  return (
    <AbsoluteFill style={{ background: C.stage, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 80% 55% at 50% ${vertical ? 52 : 58}%, #0f2a8a 0%, ${C.cobalt} 45%, ${C.stage} 85%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: width / 2 - (cols * cellW) / 2,
          top: height * (vertical ? 0.5 : 0.52),
          width: cols * cellW,
          height: rows * cellH,
          transform: `perspective(${vertical ? 900 : 700}px) rotateX(72deg)`,
          transformOrigin: "50% 0%",
        }}
      >
        <svg
          width={cols * cellW}
          height={rows * cellH}
          style={{ transform: `translateY(${shift - cellH}px)`, overflow: "visible" }}
        >
          <g fill="none" stroke={accent} strokeOpacity={0.12 * glow} strokeWidth={14}>
            {rects}
          </g>
          <g fill="none" stroke={accent} strokeOpacity={0.75 * glow} strokeWidth={3}>
            {rects}
          </g>
        </svg>
      </div>
      {/* Horizon glow and fog */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: height * (vertical ? 0.5 : 0.52) - 90,
          height: 200,
          background: `linear-gradient(180deg, transparent, ${C.stage} 45%, transparent)`,
          opacity: 0.9,
        }}
      />
      <Dust count={vertical ? 46 : 40} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(3,6,20,0.75) 100%)" }} />
    </AbsoluteFill>
  );
}

/** Luminous dust floating in the air. */
export function Dust({ count = 40, color = "#cfd8ff" }: { count?: number; color?: string }) {
  const t = useTime();
  const { width, height } = useLayout();
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const x = rand(i) * width + Math.sin(t * 0.3 + i) * 20;
        const y = (((rand(i + 50) * height - t * (8 + rand(i + 9) * 18)) % height) + height) % height;
        const s = 2 + rand(i + 3) * 4;
        const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.5 + i * 2));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: s,
              height: s,
              borderRadius: s,
              background: color,
              opacity: a,
              boxShadow: `0 0 ${s * 3}px ${color}`,
            }}
          />
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Devices and interface pieces                                              */
/* ------------------------------------------------------------------------ */

export const SCREEN_W = 360;
export const SCREEN_H = 760;

/**
 * Phone with the site's interface. The screen is laid out at 360×760 and the
 * whole device is scaled, so the interface renders the same in every layout.
 */
export function Phone({
  children,
  scale = 1,
  style,
  glow = C.blueSoft,
  time = "15:32",
}: {
  children: React.ReactNode;
  scale?: number;
  style?: React.CSSProperties;
  glow?: string;
  time?: string;
}) {
  const b = 12;
  return (
    <div
      style={{
        position: "absolute",
        width: SCREEN_W + b * 2,
        height: SCREEN_H + b * 2,
        borderRadius: 58,
        background: "linear-gradient(145deg, #262b3a, #06080f 40%, #161b2a)",
        padding: b,
        boxShadow: `0 40px 90px rgba(0,0,0,0.55), 0 0 70px ${glow}55, inset 0 0 0 1.5px rgba(255,255,255,0.18)`,
        transformOrigin: "50% 50%",
        ...style,
        transform: `${style?.transform ?? ""} scale(${scale})`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: SCREEN_W,
          height: SCREEN_H,
          borderRadius: 46,
          overflow: "hidden",
          background: C.stage,
          fontFamily: FONT,
          color: C.ink,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 30px",
            fontSize: 15,
            fontWeight: 600,
            zIndex: 20,
            ...NUM,
          }}
        >
          <span>{time}</span>
          <span style={{ display: "flex", alignItems: "flex-end" }}>
            {[6, 9, 12, 15].map((h) => (
              <span key={h} style={{ width: 3.5, height: h, background: C.ink, borderRadius: 1, marginLeft: 2 }} />
            ))}
            <span style={{ width: 24, height: 12, border: `1.5px solid ${C.ink}`, borderRadius: 4, marginLeft: 8, padding: 1.5 }}>
              <span style={{ display: "block", width: "70%", height: "100%", background: C.ink, borderRadius: 1.5 }} />
            </span>
          </span>
        </div>
        <div
          style={{
            position: "absolute",
            top: 11,
            left: SCREEN_W / 2 - 50,
            width: 100,
            height: 28,
            borderRadius: 20,
            background: "#000",
            zIndex: 21,
          }}
        />
        {children}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(125deg, rgba(255,255,255,0.08) 0%, transparent 30%)",
            pointerEvents: "none",
            zIndex: 30,
          }}
        />
      </div>
    </div>
  );
}

/** Tilted glass panel (a « 3D screen »). */
export function Panel({
  children,
  width,
  height,
  style,
  glow = C.blueSoft,
}: {
  children: React.ReactNode;
  width: number;
  height: number;
  style?: React.CSSProperties;
  glow?: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        width,
        height,
        borderRadius: 26,
        background: `linear-gradient(160deg, rgba(23,33,74,0.96), rgba(9,14,40,0.97))`,
        border: "1.5px solid rgba(142,164,255,0.35)",
        boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 60px ${glow}44`,
        overflow: "hidden",
        fontFamily: FONT,
        color: C.ink,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Button({
  label,
  color = C.accent,
  ink = C.stage,
  pressed = 0,
  big,
  style,
  icon,
}: {
  label: string;
  color?: string;
  ink?: string;
  pressed?: number;
  big?: boolean;
  style?: React.CSSProperties;
  icon?: React.ReactNode;
}) {
  return (
    <div
      style={{
        ...TITLE,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: big ? 64 : 52,
        borderRadius: 999,
        background: color,
        color: ink,
        fontSize: big ? 26 : 21,
        transform: `scale(${1 - 0.06 * pressed})`,
        boxShadow: `0 10px 30px ${color}55, 0 0 ${20 + 30 * pressed}px ${color}${pressed > 0 ? "aa" : "33"}`,
        ...style,
      }}
    >
      {icon ? <span style={{ marginRight: 10, display: "flex" }}>{icon}</span> : null}
      {label}
    </div>
  );
}

export function Pill({ children, color, bg, style }: { children: React.ReactNode; color: string; bg?: string; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 12px",
        borderRadius: 999,
        background: bg ?? `${color}22`,
        color,
        fontSize: 14,
        fontWeight: 700,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Small round dot, optionally pulsing (live indicator). */
export function Dot({ color, pulse, size = 10 }: { color: string; pulse?: boolean; size?: number }) {
  const t = useTime();
  const k = pulse ? 0.5 + 0.5 * Math.sin(t * 6) : 1;
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: size,
        background: color,
        marginRight: 8,
        boxShadow: `0 0 ${4 + 10 * k}px ${color}`,
        flex: "none",
      }}
    />
  );
}

export function LiveBadge({ label = "EN DIRECT", style }: { label?: string; style?: React.CSSProperties }) {
  return (
    <Pill color="#fff" bg={C.liveDeep} style={{ ...TITLE, fontSize: 15, letterSpacing: "0.06em", ...style }}>
      <Dot color="#fff" pulse size={8} />
      {label}
    </Pill>
  );
}

export function Card({ children, style, accent }: { children: React.ReactNode; style?: React.CSSProperties; accent?: string }) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1.5px solid ${accent ?? C.line}`,
        borderRadius: 18,
        padding: "14px 16px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Animated finger / pointer: moves between points and taps. Times in seconds (shot time). */
export function Pointer({ path, taps = [], scale = 1 }: { path: Array<[number, number, number]>; taps?: number[]; scale?: number }) {
  const t = useTime();
  if (t < path[0][0] - 0.3 || t > path[path.length - 1][0] + 0.6) return null;
  let x = path[0][1];
  let y = path[0][2];
  for (let i = 1; i < path.length; i++) {
    const [t1, x1, y1] = path[i];
    const [t0, x0, y0] = path[i - 1];
    if (t >= t0) {
      const k = ramp(t, t0, t1, "inOut");
      x = mix(x0, x1, k);
      y = mix(y0, y1, k);
    }
  }
  const appear = ramp(t, path[0][0] - 0.3, path[0][0]) * (1 - ramp(t, path[path.length - 1][0] + 0.2, path[path.length - 1][0] + 0.6));
  let press = 0;
  let ripple = -1;
  for (const tp of taps) {
    if (t >= tp - 0.12 && t <= tp + 0.18) press = Math.max(press, 1 - Math.abs(t - tp) / 0.18);
    if (t >= tp && t <= tp + 0.6) ripple = (t - tp) / 0.6;
  }
  const r = 26 * scale;
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: appear, zIndex: 50, pointerEvents: "none" }}>
      {ripple >= 0 ? (
        <div
          style={{
            position: "absolute",
            left: -r * (1 + ripple * 1.6),
            top: -r * (1 + ripple * 1.6),
            width: r * 2 * (1 + ripple * 1.6),
            height: r * 2 * (1 + ripple * 1.6),
            borderRadius: "50%",
            border: `3px solid rgba(255,255,255,${0.8 * (1 - ripple)})`,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: -r,
          top: -r,
          width: r * 2,
          height: r * 2,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.28)",
          border: "3px solid rgba(255,255,255,0.95)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.4), 0 0 24px rgba(255,255,255,0.35)",
          transform: `scale(${1 - 0.22 * press})`,
        }}
      />
    </div>
  );
}

/** A deterministic QR-code-like pattern (decorative: finder squares + modules). */
export function QR({ size, seed = 7, color = C.stage, bg = "#fff", style }: { size: number; seed?: number; color?: string; bg?: string; style?: React.CSSProperties }) {
  const n = 25;
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  let d = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (finder(x, y) || (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8)) continue;
      const on = y === 6 || x === 6 ? (x + y) % 2 === 0 : rand(seed * 1000 + y * n + x) > 0.52;
      if (on) d += `M${x} ${y}h1v1h-1z`;
    }
  const f = (x: number, y: number) =>
    `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} style={{ background: bg, borderRadius: size * 0.06, ...style }}>
      <path d={d + f(0, 0) + f(n - 7, 0) + f(0, n - 7)} fill={color} fillRule="evenodd" />
    </svg>
  );
}

/** Logo of the site (packages/ui/src/logo.tsx), with the wordmark. */
export function Logo({ size, accent = C.blueSoft, color = C.ink, wordmark = true }: { size: number; accent?: string; color?: string; wordmark?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", color }}>
      <svg width={size} height={size} viewBox="0 0 44 44">
        <path d="M10 6 H24 L16 38 H2 Z" fill={color} />
        <path d="M28 6 H42 L34 38 H20 Z" fill={accent} />
      </svg>
      {wordmark ? (
        <span
          style={{
            fontFamily: FONT,
            fontStyle: "italic",
            fontStretch: "75%",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            fontSize: size * 0.95,
            marginLeft: size * 0.22,
            lineHeight: 1,
          }}
        >
          Orga<span style={{ color: accent }}>Sport</span>
        </span>
      ) : null}
    </div>
  );
}

/** Typing effect: the first characters of a text, with a caret. */
export function typed(text: string, t: number, from: number, cps = 9) {
  const n = Math.max(0, Math.min(text.length, Math.floor((t - from) * cps)));
  return text.slice(0, n);
}

export function Caret({ on = true }: { on?: boolean }) {
  const t = useTime();
  return on && Math.floor(t * 2.2) % 2 === 0 ? (
    <span style={{ display: "inline-block", width: 2, height: "1em", background: C.ink, marginLeft: 2, verticalAlign: "-0.1em" }} />
  ) : null;
}

/** Notification banner (push notification look). */
export function Notification({ title, body, k, accent = C.accent, style }: { title: string; body: string; k: number; accent?: string; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        right: 10,
        top: 50,
        padding: "12px 14px",
        borderRadius: 22,
        background: "rgba(30,40,86,0.92)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: `0 16px 40px rgba(0,0,0,0.5), 0 0 30px ${accent}44`,
        display: "flex",
        alignItems: "center",
        transform: `translateY(${(1 - k) * -130}px)`,
        opacity: clamp01(k * 2),
        zIndex: 25,
        fontFamily: FONT,
        ...style,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: C.stage,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
          flex: "none",
        }}
      >
        <Logo size={26} wordmark={false} accent={accent} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 14, color: C.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{body}</div>
      </div>
    </div>
  );
}

/** A beam of light travelling between two points (notification « sent »). */
export function Beam({ x1, y1, x2, y2, k, color }: { x1: number; y1: number; x2: number; y2: number; k: number; color: string }) {
  if (k <= 0 || k >= 1) return null;
  const x = mix(x1, x2, k);
  const y = mix(y1, y2, k) - Math.sin(k * Math.PI) * 60;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 9,
        top: y - 9,
        width: 18,
        height: 18,
        borderRadius: 9,
        background: "#fff",
        boxShadow: `0 0 18px 6px ${color}, 0 0 50px 12px ${color}88`,
        zIndex: 40,
      }}
    />
  );
}

export { NUM, TITLE, FONT };
