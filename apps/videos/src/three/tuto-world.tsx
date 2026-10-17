import React, { useMemo } from "react";
import * as THREE from "three";
import { C, clamp01, mix, ramp } from "../theme";
import { Bars, Boule, Boulodrome, Cam, Dust3D, Floor, Stage3D, TERRAIN_BARS, terrainCenter, track, type V3 } from "./world";

/**
 * The single 3D world of the tutorial (0–150 s, absolute time T): a black reflective
 * boulodrome of 32 neon terrains, three polished steel boules + a jack on terrain 12,
 * and a camera that dollies / orbits from chapter to chapter (docs/videos/storyboard.md).
 */

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** Terrain 12 (index 11): the boules rest there. */
const H: V3 = terrainCenter(11);
const T5: V3 = terrainCenter(4);
const T8: V3 = terrainCenter(7);

/** Terrains available in the example (20 of 32), and those used by the scores. */
const AVAILABLE = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
const SCORED: Array<{ at: number; i: number }> = [
  { at: 102.4, i: 11 },
  { at: 104.6, i: 4 },
  { at: 106.8, i: 7 },
];
const UNDO = 114;

function cameraKeys(vertical: boolean) {
  // [time, position, look]
  const k: Array<[number, V3, V3]> = [
    [0, add(H, [2.3, 0.85, 3.1]), add(H, [0.05, 0.62, 0])],
    [4, add(H, [-1.5, 1.0, 3.5]), add(H, [0, 0.7, 0])],
    [8.6, add(H, [-5, 3.4, 7]), add(H, [1.5, 0.2, -3])],
    [15, [-12, 7, 9], [0, 0, -6]],
    [24, [-15, 9, 1], [2, 0, -6]],
    [34, [-10, 11, -10], [3, 0, -2]],
    [41, [-4, 26, 14], [1, 0, -4]],
    [47, [2, 34, 22], [2, 0, -3]],
    [54, [8, 26, 20], [2, 0, -3]],
    [57.5, add(H, [5.2, 2.6, 7]), add(H, [1.6, 0.6, 0])],
    [66, add(H, [-4.4, 2.2, 6.4]), add(H, [1.2, 0.6, 0])],
    [72.5, add(H, [-2.6, 3.2, 8.4]), add(H, [1, 0.2, -1])],
    [80, [12, 14, 20], [0, 0, -2]],
    [86, [-8, 13, 18], [0, 0, -4]],
    [93.6, [-2, 19, 22], [0, 0, -4]],
    [99, [6, 22, 22], [1, 0, -4]],
    [104, [8, 10, 3], [5, 0, -14]],
    [109.5, [10, 13, 9], [5, 0, -14]],
    [113.6, [12, 17, 15], [5, 0, -14]],
    [115.2, [8, 9, 1], [8, 0, -16]],
    [118.6, [6, 8, 0], [4, 0, -16]],
    [124, add(T5, [3, 3.4, 8]), add(T5, [0, 0, 0])],
    [131, add(T5, [-3, 2.6, 7]), add(T5, [0, 0, -1])],
    [135.6, add(H, [3, 1.4, 4.2]), add(H, [0.2, 1.0, 0])],
    [142, add(H, [-4, 4, 8]), add(H, [0, 1.6, -2])],
    [150, [-10, 22, 32], [0, 0, -4]],
  ];
  if (!vertical) return k;
  // Vertical: same moves, a bit further from the target (the field is narrower).
  return k.map(([t, p, l]) => [t, add(l, [(p[0] - l[0]) * 1.25, (p[1] - l[1]) * 1.25, (p[2] - l[2]) * 1.25]), l] as [number, V3, V3]);
}

/** Lit level of each terrain (lines, numbers + players) and cyan / red highlights. */
function field(T: number) {
  const lines = new Float32Array(32);
  const on = new Float32Array(32);
  const cyan = new Float32Array(TERRAIN_BARS.length);
  const red = new Float32Array(TERRAIN_BARS.length);
  for (let i = 0; i < 32; i++) {
    const c = terrainCenter(i);
    const d = Math.hypot(c[0] - H[0], c[2] - H[2]);
    // Intro: a light wave from the boules.
    let l = 0.32 * ramp(T, 3 + d * 0.08, 4 + d * 0.08);
    let o = 0;
    // Terrains chapter: the 32 needed terrains flash, then the 20 available stay lit.
    const need = ramp(T, 43.6 + i * 0.03, 44 + i * 0.03) * (1 - ramp(T, 44.6, 45.2));
    const avail = AVAILABLE.has(i) ? ramp(T, 44.6 + i * 0.05, 45 + i * 0.05) : 0;
    const terrains = T > 43 && T < 56 ? Math.max(need, avail) * (1 - ramp(T, 54.4, 55.6)) : 0;
    l = Math.max(l, terrains);
    // Draw: a wave from the centre lights the 20 terrains + players.
    const draw = AVAILABLE.has(i) ? ramp(T, 94.6 + Math.hypot(...c) * 0.03, 95.1 + Math.hypot(...c) * 0.03) : 0;
    l = Math.max(l, 0.95 * draw);
    o = Math.max(o, draw, AVAILABLE.has(i) ? 0.85 * terrains : 0);
    lines[i] = l;
    on[i] = o;
  }
  // Décalé terrains (12 games waiting) glow steadily in cyan during the terrains chapter (no blinking).
  for (let b = 0; b < TERRAIN_BARS.length; b++) {
    const i = Math.floor(b / 4);
    if (!AVAILABLE.has(i) && T > 45 && T < 55.6) cyan[b] = 0.4 * ramp(T, 45.4, 46) * (1 - ramp(T, 54.4, 55.6));
  }
  // Scores: each scored terrain flashes cyan; the undone one (terrain 8) flashes red then dims.
  for (const s of SCORED) {
    const k = ramp(T, s.at, s.at + 0.25) * (1 - 0.6 * ramp(T, s.at + 0.6, s.at + 1.6));
    const undone = s.i === 7 ? ramp(T, UNDO + 0.1, UNDO + 0.4) : 0;
    for (let e = 0; e < 4; e++) {
      cyan[s.i * 4 + e] = Math.max(cyan[s.i * 4 + e], k * (1 - undone));
      red[s.i * 4 + e] = undone * (1 - ramp(T, UNDO + 1.2, UNDO + 2.4));
    }
  }
  // Players: terrain 5 is « your » terrain.
  const mine = ramp(T, 124.5, 125.2) * (1 - ramp(T, 134, 135));
  for (let e = 0; e < 4; e++) cyan[4 * 4 + e] = Math.max(cyan[4 * 4 + e], mine);
  // Outro: everything lights up and stays steady.
  for (let i = 0; i < 32; i++) {
    const p = ramp(T, 135.5 + i * 0.03, 136.5 + i * 0.03);
    lines[i] = Math.max(lines[i] * (1 - ramp(T, 135, 135.6)), 0.85 * p);
    on[i] = Math.max(on[i] * (1 - ramp(T, 135, 135.6)), p);
  }
  return { lines, on, cyan, red };
}

/** Jack (cochonnet): blue resin, a little shiny. */
function Jack({ pos }: { pos: V3 }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: C.blue, roughness: 0.32, metalness: 0, emissive: new THREE.Color(C.blue), emissiveIntensity: 0.25 }), []);
  return (
    <mesh position={pos} material={mat}>
      <sphereGeometry args={[0.13, 32, 24]} />
    </mesh>
  );
}

/** A boule that rolls on the ground: rotation follows the distance travelled. */
function Rolling({ from, to, t0, t1, T, r, spin = 0 }: { from: V3; to: V3; t0: number; t1: number; T: number; r: number; spin?: number }) {
  const k = ramp(T, t0, t1);
  const p: V3 = [mix(from[0], to[0], k), r, mix(from[2], to[2], k)];
  const dist = Math.hypot(to[0] - from[0], to[2] - from[2]) * k;
  const dir = Math.atan2(to[0] - from[0], to[2] - from[2]);
  return (
    <group position={p} rotation={[0, dir, 0]}>
      <group rotation={[dist / r, 0, 0]}>
        <Boule pos={[0, 0, 0]} radius={r} rot={spin} />
      </group>
    </group>
  );
}

export function TutoWorld({ T, vertical }: { T: number; vertical: boolean }) {
  const keys = useMemo(() => cameraKeys(vertical), [vertical]);
  const pos = track(keys.map(([t, p]) => [t, p] as [number, V3]), T);
  const look = track(keys.map(([t, , l]) => [t, l] as [number, V3]), T);
  const f = field(T);
  const R = 0.36;
  return (
    <Stage3D>
      <Cam pos={pos} look={look} fog={0.014} />
      <directionalLight position={[-6, 3, -8]} intensity={1.4} color={C.blueSoft} />
      <pointLight position={add(H, [1.5, 2.2, 2.5])} intensity={6} distance={10} color="#e8eeff" />
      <Floor veil={0.78} />
      <Boulodrome lines={f.lines} on={f.on} t={T} color={C.blueSoft} />
      <Bars bars={TERRAIN_BARS} bright={f.cyan} color={C.cyan} />
      <Bars bars={TERRAIN_BARS} bright={f.red} color={C.live} />
      <Rolling from={add(H, [-0.5, 0, 0.4])} to={add(H, [-0.5, 0, 0.4])} t0={0} t1={1} T={T} r={R} spin={0.4} />
      <Rolling from={add(H, [0.45, 0, 0.8])} to={add(H, [0.45, 0, 0.8])} t0={0} t1={1} T={T} r={R} spin={2.1} />
      <Rolling from={add(H, [2.6, 0, 5.5])} to={add(H, [0.2, 0, -0.5])} t0={0.4} t1={3.2} T={T} r={R} spin={1.2} />
      <Jack pos={add(H, [0.05, 0.13, 0.15])} />
      <Dust3D t={T} center={[0, 0, -4]} size={[44, 10, 56]} count={220} />
      {/* Halo on the boules: the « hero » spot. */}
      <mesh position={add(H, [0, 0.02, 0.2])} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[2.4, 48]} />
        <meshBasicMaterial color={C.blue} transparent opacity={0.07 * clamp01(1 - Math.abs(T - 70) / 200)} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </Stage3D>
  );
}

export const WORLD = { H, T5, T8 };
