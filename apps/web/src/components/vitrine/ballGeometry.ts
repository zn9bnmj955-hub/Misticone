/**
 * Shared geometry of the landing ball, used by the static SVG ball (first
 * paint) and by the lazily loaded 3D ball, so the hand-off between them is
 * seamless: same orientation, same panels, same grooves.
 *
 * Pure math: no DOM, no three.js (this file ships with the page).
 */

export type Vec3 = [number, number, number];

/** Visual of a sport's ball. "plain" = any sport without a dedicated look. */
export type BallLook = "steel" | "panels" | "plain";

/** Index of each look in the 3D shader (`uFrom` / `uTo`). */
export const LOOK_INDEX: Readonly<Record<BallLook, number>> = { steel: 0, panels: 1, plain: 2 };

/**
 * Ball look of a sport, keyed by its icon id (the same ids as the shared icon
 * set in @orgasport/ui): a visual asset table, not sport logic. A sport added
 * to packages/sports without an entry here simply gets the plain ball in its
 * accent color.
 */
const LOOK_BY_ICON: Readonly<Record<string, BallLook>> = { petanque: "steel", football: "panels" };

export function ballLookFor(icon: string): BallLook {
  return LOOK_BY_ICON[icon] ?? "plain";
}

/** Sport data the hero needs (computed on the server from @orgasport/sports). */
export type StageSport = { slug: string; name: string; icon: string; accentToken: string };

const PHI = (1 + Math.sqrt(5)) / 2;

/** Icosahedron (edge length 2): its vertices are the 12 pentagon centers of a football. */
export const ICO_VERTICES: readonly Vec3[] = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];

const dist2 = (a: Vec3, b: Vec3) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** The 30 icosahedron edges (pairs of vertex indexes). */
export const ICO_EDGES: readonly [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let i = 0; i < 12; i++)
    for (let j = i + 1; j < 12; j++) if (Math.abs(dist2(ICO_VERTICES[i], ICO_VERTICES[j]) - 4) < 1e-6) out.push([i, j]);
  return out;
})();

/** The 20 hexagon centers of a football (= icosahedron face centers), unit length. */
export const HEXAGON_CENTERS: readonly Vec3[] = (() => {
  const adjacent = (a: number, b: number) => ICO_EDGES.some(([i, j]) => (i === a && j === b) || (i === b && j === a));
  const out: Vec3[] = [];
  for (let i = 0; i < 12; i++)
    for (let j = i + 1; j < 12; j++)
      for (let k = j + 1; k < 12; k++)
        if (adjacent(i, j) && adjacent(j, k) && adjacent(i, k)) {
          const [a, b, c] = [ICO_VERTICES[i], ICO_VERTICES[j], ICO_VERTICES[k]];
          out.push(normalize([a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]]));
        }
  return out;
})();

/** The 12 pentagon centers, unit length. */
export const PENTAGON_CENTERS: readonly Vec3[] = ICO_VERTICES.map(normalize);

/** Steel ball grooves: rings around the object X axis at these offsets (shader uses the same). */
export const GROOVE_OFFSETS: readonly number[] = [-0.24, 0, 0.24];

/** Initial orientation shared by the static and the 3D ball (three.js Euler, order XYZ, radians). */
export const BALL_TILT: Vec3 = [0.5, -0.65, 0.18];

/** Apparent radius of the ball in its square box (3D camera framing = static SVG). */
export const BALL_RADIUS = 0.85;

/** Row-major rotation matrix of a three.js Euler "XYZ" (same as Matrix4.makeRotationFromEuler). */
export function rotationMatrix([x, y, z]: Vec3): number[] {
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [c * e, -c * f, d, af + be * d, ae - bf * d, -b * c, bf - ae * d, be + af * d, a * c];
}

export function rotate(m: number[], v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Point a third of the way along the icosahedron edge a→b (a truncated icosahedron vertex), on the unit sphere. */
export function truncationPoint(a: number, b: number): Vec3 {
  const p = ICO_VERTICES[a], q = ICO_VERTICES[b];
  return normalize([p[0] + (q[0] - p[0]) / 3, p[1] + (q[1] - p[1]) / 3, p[2] + (q[2] - p[2]) / 3]);
}
