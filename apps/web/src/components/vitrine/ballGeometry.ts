/**
 * Shared geometry of the landing ball (football panels, steel grooves, pose),
 * used by the 3D ball and by the script that pre-renders its still images.
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
export const GROOVE_OFFSETS: readonly number[] = [-0.12, 0, 0.12];

/** Initial orientation of the ball (radians): x tilt, spin, roll — see poseBall in ballModel.ts. */
export const BALL_TILT: Vec3 = [0.5, -0.65, 0.18];
