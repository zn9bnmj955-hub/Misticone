import React from "react";
import { C, NUM, TITLE, clamp01, mix, ramp } from "../theme";
import { QR } from "../ui/kit";

/**
 * 3D building blocks of the tutorial, in CSS 3D (cheap to render): poses keyed in
 * time for the devices, cards that fly out of a screen and assemble in depth, an
 * extruded bank card and padlock. Positions are in video pixels (centre of the
 * element), z in pixels towards the viewer, angles in degrees.
 */

export type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz?: number; s?: number; o?: number };
export const PERSPECTIVE = 1500;

/** Pose at time T: holds between keys, eases in/out from one key to the next. */
export function poseAt(keys: Array<[number, Pose]>, T: number): Pose {
  if (T <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, p1] = keys[i];
    if (T < t1) {
      const [t0, p0] = keys[i - 1];
      return lerpPose(p0, p1, ramp(T, t0, t1, "inOut"));
    }
  }
  return keys[keys.length - 1][1];
}

export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  return {
    x: mix(a.x, b.x, k),
    y: mix(a.y, b.y, k),
    z: mix(a.z, b.z, k),
    rx: mix(a.rx, b.rx, k),
    ry: mix(a.ry, b.ry, k),
    rz: mix(a.rz ?? 0, b.rz ?? 0, k),
    s: mix(a.s ?? 1, b.s ?? 1, k),
    o: mix(a.o ?? 1, b.o ?? 1, k),
  };
}

export const transformOf = (p: Pose) =>
  `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, ${p.z.toFixed(1)}px) rotateX(${p.rx.toFixed(2)}deg) rotateY(${p.ry.toFixed(2)}deg) rotateZ(${(p.rz ?? 0).toFixed(2)}deg) scale(${(p.s ?? 1).toFixed(3)}) translate(-50%, -50%)`;

/** An element placed at a pose (top-left of the frame is the origin). */
export function At({ pose, children, z = 10, style }: { pose: Pose; children: React.ReactNode; z?: number; style?: React.CSSProperties }) {
  const o = pose.o ?? 1;
  if (o <= 0.002) return null;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: transformOf(pose), opacity: o, zIndex: z, ...style }}>
      {children}
    </div>
  );
}

/**
 * A card that flies out of a screen (pose `from`, small, same angle) to its place
 * `to`, with a forward arc; after `out` it leaves backwards into the depth.
 */
export function Fly({
  T,
  at,
  out = 999,
  from,
  to,
  children,
  dur = 0.9,
  arc = 260,
  z = 20,
}: {
  T: number;
  at: number;
  out?: number;
  from: Pose;
  to: Pose;
  children: React.ReactNode;
  dur?: number;
  arc?: number;
  z?: number;
}) {
  if (T < at || T > out + 0.8) return null;
  const k = ramp(T, at, at + dur);
  const start: Pose = { ...from, s: 0.35, o: 0 };
  const p = lerpPose(start, to, k);
  p.z += Math.sin(Math.PI * k) * arc;
  p.o = clamp01(ramp(T, at, at + 0.25)) * (to.o ?? 1);
  const e = ramp(T, out, out + 0.6, "inOut");
  if (e > 0) {
    p.z -= e * 900;
    p.y -= e * 60;
    p.ry += e * 25;
    p.o *= 1 - e;
  }
  // Slow float once in place.
  p.y += Math.sin(T * 1.3 + at) * 4 * k;
  return (
    <At pose={p} z={z}>
      {children}
    </At>
  );
}

/* ------------------------------------------------------------------------ */
/* Cards                                                                     */
/* ------------------------------------------------------------------------ */

const glass = (color: string): React.CSSProperties => ({
  background: "linear-gradient(160deg, rgba(21,26,42,0.97), rgba(8,10,18,0.97))",
  border: `2px solid ${color}aa`,
  boxShadow: `0 30px 70px rgba(0,0,0,0.6), 0 0 46px ${color}40, inset 0 1px 0 rgba(255,255,255,0.12)`,
  borderRadius: 24,
  color: C.ink,
  fontFamily: "Saira",
});

/** Icon + title + optional subtitle. Sizes follow the layout (≥ 28 px / ≥ 34 px). */
export function InfoCard({ icon, color = C.accent, title, sub, w, v }: { icon?: string; color?: string; title: React.ReactNode; sub?: React.ReactNode; w: number; v: boolean }) {
  return (
    <div style={{ ...glass(color), width: w, display: "flex", alignItems: "center", padding: v ? "18px 24px" : "14px 20px" }}>
      {icon ? (
        <div style={{ width: v ? 66 : 58, height: v ? 66 : 58, borderRadius: 18, background: `${color}26`, color, fontSize: v ? 36 : 32, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 18, flex: "none" }}>
          {icon}
        </div>
      ) : null}
      <div style={{ minWidth: 0 }}>
        <div style={{ ...TITLE, fontSize: v ? 40 : 34, lineHeight: 1.04, ...NUM }}>{title}</div>
        {sub ? <div style={{ fontSize: v ? 32 : 27, lineHeight: 1.15, color: C.inkSoft, fontWeight: 600, marginTop: 2, ...NUM }}>{sub}</div> : null}
      </div>
    </div>
  );
}

/** A field of the form, as a floating card: label + value. */
export function FieldCard({ label, value, w, v, color = C.accent, saved }: { label: string; value: string; w: number; v: boolean; color?: string; saved?: number }) {
  return (
    <div style={{ ...glass(color), width: w, padding: v ? "14px 24px" : "10px 20px" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ ...TITLE, flex: 1, fontSize: v ? 30 : 26, color: C.accentInk, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
        {saved ? <span style={{ fontSize: v ? 30 : 26, fontWeight: 800, color: C.success, opacity: saved }}>✓</span> : null}
      </div>
      <div style={{ ...TITLE, fontSize: v ? 40 : 34, lineHeight: 1.05, ...NUM }}>{value}</div>
    </div>
  );
}

/** A line of a list (score, draw, history): optional left tag, text, right tag. */
export function LineCard({ tag, text, right, w, v, color = C.accent, dim = 0, strike = 0 }: { tag?: string; text: string; right?: React.ReactNode; w: number; v: boolean; color?: string; dim?: number; strike?: number }) {
  return (
    <div style={{ ...glass(color), width: w, display: "flex", alignItems: "center", padding: v ? "12px 22px" : "9px 18px", borderRadius: 18, ...NUM }}>
      {tag ? <span style={{ ...TITLE, fontSize: v ? 34 : 29, color: C.accentInk, marginRight: 16, flex: "none" }}>{tag}</span> : null}
      <span style={{ position: "relative", flex: 1, ...TITLE, fontWeight: 700, fontSize: v ? 36 : 30, color: dim > 0.5 ? C.inkSoft : C.ink, whiteSpace: "nowrap" }}>
        {text}
        {strike > 0 ? <span style={{ position: "absolute", left: 0, top: "52%", height: 4, width: `${strike * 100}%`, background: C.live, borderRadius: 2 }} /> : null}
      </span>
      {right ? <span style={{ marginLeft: 12, flex: "none" }}>{right}</span> : null}
    </div>
  );
}

/** Sport tile with a small 3D emblem (a steel ball, or a football in cyan). */
export function SportTile({ label, steel, active, w, v }: { label: string; steel?: boolean; active: number; w: number; v: boolean }) {
  const color = steel ? C.accent : C.cyan;
  const ball = v ? 92 : 78;
  return (
    <div style={{ ...glass(active > 0.5 ? color : C.line), width: w, padding: v ? "22px 18px" : "18px 16px", textAlign: "center", boxShadow: `0 30px 70px rgba(0,0,0,0.6), 0 0 ${20 + 50 * active}px ${color}${active > 0.5 ? "88" : "30"}` }}>
      <div
        style={{
          width: ball,
          height: ball,
          borderRadius: "50%",
          margin: "0 auto 12px",
          background: steel
            ? "radial-gradient(circle at 34% 30%, #ffffff 0%, #dfe5f2 12%, #8d97ad 38%, #3b4256 66%, #10131c 100%)"
            : `radial-gradient(circle at 34% 30%, #ffffff 0%, ${C.cyanInk} 30%, #0b3b66 80%)`,
          boxShadow: `0 10px 26px rgba(0,0,0,0.6), 0 0 30px ${color}55`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {steel
          ? [0.42, 0.5, 0.58].map((y) => (
              <div key={y} style={{ position: "absolute", left: -4, right: -4, top: `${y * 100}%`, height: 2, background: "rgba(16,20,30,0.55)", transform: "rotate(-18deg)" }} />
            ))
          : null}
      </div>
      <div style={{ ...TITLE, fontSize: v ? 42 : 36 }}>{label}</div>
    </div>
  );
}

/** QR code on a thick white tile. */
export function QRTile({ size, v }: { size: number; v: boolean }) {
  return (
    <div style={{ background: "#fff", padding: 14, borderRadius: 20, boxShadow: `0 30px 70px rgba(0,0,0,0.6), 0 0 60px ${C.accent}66`, textAlign: "center" }}>
      <QR size={size} seed={11} />
      <div style={{ ...TITLE, fontSize: v ? 34 : 28, color: C.stage, marginTop: 4 }}>QR code</div>
    </div>
  );
}

/** A4 poster with the QR code. */
export function Poster({ w, v }: { w: number; v: boolean }) {
  const s = w / 220;
  return (
    <div style={{ width: w, height: 311 * s, background: "#f4f6fb", borderRadius: 6 * s, padding: 16 * s, color: C.stage, fontFamily: "Saira", boxShadow: `0 30px 70px rgba(0,0,0,0.55), 0 0 60px ${C.accent}55` }}>
      <div style={{ height: 12 * s, background: `linear-gradient(90deg, ${C.blue}, ${C.cyan})`, borderRadius: 3 * s, marginBottom: 10 * s }} />
      <div style={{ ...TITLE, fontSize: 30 * s, lineHeight: 0.95 }}>GRAND PRIX D'AUTOMNE</div>
      <QR size={104 * s} seed={11} style={{ display: "block", margin: `${10 * s}px auto` }} />
      <div style={{ ...TITLE, fontSize: (v ? 21 : 19) * s, textAlign: "center" }}>Affiche A4</div>
    </div>
  );
}

/**
 * Extruded object: the same face repeated in depth (CSS 3D), so it shows a real
 * edge when it turns. `depth` in px, `layers` slices.
 */
function Extrude({ w, h, depth, layers = 8, radius, edge, face, back }: { w: number; h: number; depth: number; layers?: number; radius: number | string; edge: string; face: React.ReactNode; back?: React.ReactNode }) {
  return (
    <div style={{ position: "relative", width: w, height: h, transformStyle: "preserve-3d" }}>
      {Array.from({ length: layers }, (_, i) => (
        <div key={i} style={{ position: "absolute", inset: 0, borderRadius: radius, background: edge, transform: `translateZ(${(-depth * (i + 1)) / layers}px)` }} />
      ))}
      {back ? <div style={{ position: "absolute", inset: 0, transform: `translateZ(${-depth - 0.5}px) rotateY(180deg)`, backfaceVisibility: "hidden" }}>{back}</div> : null}
      <div style={{ position: "absolute", inset: 0, transform: "translateZ(0.5px)" }}>{face}</div>
    </div>
  );
}

/** Bank card (no brand): black and electric blue, chip, masked number. */
export function BankCard({ w, v, shine }: { w: number; v: boolean; shine: number }) {
  const h = w * 0.63;
  return (
    <Extrude
      w={w}
      h={h}
      depth={10}
      radius={18}
      edge="#0a1440"
      face={
        <div style={{ position: "absolute", inset: 0, borderRadius: 18, overflow: "hidden", background: `linear-gradient(135deg, #05070e 0%, #0c1a52 45%, ${C.blue} 100%)`, border: `1.5px solid ${C.blueSoft}88`, boxShadow: `0 0 50px ${C.blue}66`, color: C.ink, fontFamily: "Saira" }}>
          <div style={{ position: "absolute", left: `${-60 + shine * 160}%`, top: -40, width: "40%", height: "200%", transform: "rotate(20deg)", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)" }} />
          <div style={{ position: "absolute", left: w * 0.08, top: h * 0.3, width: w * 0.15, height: w * 0.11, borderRadius: 7, background: "linear-gradient(135deg, #dfe6f5, #8e99b3)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)" }} />
          <div style={{ position: "absolute", left: w * 0.08, bottom: h * 0.12, ...TITLE, fontSize: v ? 38 : 32, letterSpacing: "0.08em", ...NUM }}>•••• 4242</div>
          <div style={{ position: "absolute", right: w * 0.08, top: h * 0.12, width: w * 0.16, height: w * 0.1, borderRadius: 999, border: `3px solid ${C.cyanInk}`, opacity: 0.8 }} />
        </div>
      }
    />
  );
}

/** Padlock: extruded body + shackle that closes (closed 0 → 1). */
export function Padlock({ size, closed, glow }: { size: number; closed: number; glow: number }) {
  const bw = size;
  const bh = size * 0.78;
  const sh = size * 0.62;
  const thick = size * 0.13;
  return (
    <div style={{ position: "relative", width: bw, height: bh + sh * 0.7, transformStyle: "preserve-3d" }}>
      <div
        style={{
          position: "absolute",
          left: bw * 0.18,
          width: bw * 0.64,
          height: sh,
          top: (1 - closed) * -sh * 0.38,
          border: `${thick}px solid #c9d2e6`,
          borderBottom: "none",
          borderRadius: `${bw}px ${bw}px 0 0`,
          boxShadow: `0 0 ${20 * glow}px ${C.cyan}`,
          transformOrigin: "85% 100%",
          transform: `rotateY(${(1 - closed) * 140}deg)`,
          background: "transparent",
          borderColor: `rgb(${Math.round(mix(201, 140, glow))}, ${Math.round(mix(210, 220, glow))}, 255)`,
        }}
      />
      <div style={{ position: "absolute", left: 0, top: sh * 0.7, transformStyle: "preserve-3d" }}>
        <Extrude
          w={bw}
          h={bh}
          depth={size * 0.22}
          layers={8}
          radius={size * 0.16}
          edge="#0b1a5c"
          face={
            <div style={{ position: "absolute", inset: 0, borderRadius: size * 0.16, background: `linear-gradient(150deg, ${C.blueSoft}, ${C.blue} 50%, #0a1a66)`, boxShadow: `0 0 ${30 + 60 * glow}px ${C.blue}${glow > 0.5 ? "cc" : "66"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: size * 0.16, height: size * 0.3, borderRadius: size, background: "#04060c" }} />
            </div>
          }
        />
      </div>
    </div>
  );
}

/** Big « undo » ring that spins backwards. */
export function RewindRing({ size, k, spin }: { size: number; k: number; spin: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", border: `${size * 0.07}px solid ${C.cyan}`, borderTopColor: "transparent", transform: `rotate(${-spin}deg)`, boxShadow: `0 0 50px ${C.cyan}88, inset 0 0 40px ${C.cyan}55`, opacity: k, display: "flex", alignItems: "center", justifyContent: "center", color: C.cyanInk, fontSize: size * 0.5, fontWeight: 800 }}>
      <span style={{ transform: `rotate(${spin}deg)` }}>↶</span>
    </div>
  );
}
