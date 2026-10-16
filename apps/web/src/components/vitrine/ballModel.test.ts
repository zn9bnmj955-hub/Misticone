import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Mesh, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import * as geometry from "./ballGeometry";
import { BALL_FINISH, ENGRAVING_TEXT, GLYPHS, layoutEngraving } from "./ballGeometry";
import { REST_SPIN, engravingFrame, frameBallCamera, poseBall } from "./ballModel";

const source = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");

describe("landing ball: smooth dark silver steel", () => {
  it("is a mirror-like metal, very dark silver, softly rough", () => {
    expect(BALL_FINISH.color).toBe("#2b2d31");
    expect(BALL_FINISH.metalness).toBe(1);
    expect(BALL_FINISH.roughness).toBeGreaterThanOrEqual(0.2);
    expect(BALL_FINISH.roughness).toBeLessThanOrEqual(0.3);
  });

  it("reflects a neutral grey studio (no night-blue cast), with a soft highlight", () => {
    const model = source("ballModel.ts");
    const env = model.slice(model.indexOf("export function createEnvironment"), model.indexOf("export type BallModel"));
    expect(env).toMatch(/roomM = new MeshBasicMaterial\(\{ color: grey\(/);
    expect(env).toMatch(/const white = grey\(colors\.light\)/);
    // Blue only on the two thin neon tubes (a faint rim), never on the room, the lights or the horizon.
    expect(env.match(/colors\.(accent|line)\b(?!\))/g)?.filter((m) => m === "colors.accent")).toHaveLength(2);
    expect(env).not.toMatch(/lerp\(colors\.(accent|line)/);
    const gains = [...env.matchAll(/white\.clone\(\)\.multiplyScalar\(([\d.]+)\)/g)].map((m) => Number(m[1]));
    expect(Math.max(...gains)).toBeLessThanOrEqual(3);
    expect(Number(/envMapIntensity: ([\d.]+)/.exec(model)?.[1])).toBeLessThanOrEqual(1.5);
  });

  it("has no grooves, no striations and no football left", () => {
    for (const name of ["GROOVE_OFFSETS", "HEXAGON_CENTERS", "PENTAGON_CENTERS", "ICO_EDGES", "LOOK_INDEX", "ballLookFor"])
      expect(geometry).not.toHaveProperty(name);
    for (const file of ["ballModel.ts", "ballGeometry.ts", "heroScene3d.ts", "SportHero.tsx"]) {
      const code = source(file);
      expect(code, file).not.toMatch(/[Ff]ootball|panels|[Pp]entagon|[Hh]exagon|GROOVE|grooveHalf|setLook|uPitch/);
    }
  });
});

describe("landing ball: ORGASPORT engraving", () => {
  it("engraves ORGASPORT only, every letter drawn by the built-in stroke font", () => {
    expect(ENGRAVING_TEXT).toBe("ORGASPORT");
    for (const ch of ENGRAVING_TEXT) expect(GLYPHS[ch], ch).toBeDefined();
    const { x, width } = layoutEngraving();
    expect(x).toHaveLength(9);
    expect(x.every((v, i) => i === 0 || v > x[i - 1])).toBe(true);
    expect(width).toBeGreaterThan(9);
  });

  it("draws a G that cannot be read as a C: a clear inward bar, a stem, an open arc", () => {
    const [arc, bar, stem] = GLYPHS.G.strokes;
    const [, , , , , start, end] = arc[0] as [string, number, number, number, number, number, number, number];
    // The arc stops high on the right at the top (well above the bar) and leaves the opening.
    expect(Math.sin(start)).toBeLessThan(-0.7);
    // Horizontal bar going in towards the centre, at least half a cap height long.
    const [[, bx0, by0], [, bx1, by1]] = bar as [string, number, number][];
    expect(by0).toBe(by1);
    expect(Math.min(bx0, bx1)).toBeLessThanOrEqual(0.6);
    expect(Math.abs(bx1 - bx0)).toBeGreaterThanOrEqual(0.5);
    // Vertical stem from the bar down to the end of the arc.
    const [[, sx0, sy0], [, sx1, sy1]] = stem as [string, number, number][];
    expect(sx0).toBe(sx1);
    expect(sy0).toBe(by0);
    expect(sy1).toBeGreaterThanOrEqual(0.5 + 0.5 * Math.sin(end) - 0.1);
  });

  it("uses no external font", () => {
    expect(source("ballModel.ts")).not.toMatch(/\bfont\s*=|fillText|strokeText|FontFace|fonts\.googleapis/);
  });

  it("faces the camera, readable left to right, when the ball is at rest", () => {
    const { c, e, n } = engravingFrame();
    // Orthonormal frame.
    expect(c.length()).toBeCloseTo(1, 5);
    expect(e.dot(c)).toBeCloseTo(0, 5);
    expect(n.dot(c)).toBeCloseTo(0, 5);
    expect(new Vector3().crossVectors(e, n).dot(c)).toBeCloseTo(1, 5); // not mirrored

    const ball = new Mesh();
    poseBall(ball, REST_SPIN);
    const cam = new PerspectiveCamera();
    frameBallCamera(cam);
    const toCamera = cam.position.clone().normalize();
    const world = (v: Vector3) => v.clone().applyQuaternion(ball.quaternion);
    expect(world(c).dot(toCamera)).toBeGreaterThan(0.97);
    // Reads to the right and stands upright on screen (a slight rise to the right, like the reference).
    const screenRight = new Vector3(1, 0, 0);
    const screenUp = new Vector3().crossVectors(toCamera, screenRight).normalize();
    expect(world(e).dot(screenRight)).toBeGreaterThan(0.95);
    expect(world(e).dot(screenUp)).toBeGreaterThan(0);
    expect(world(n).dot(screenUp)).toBeGreaterThan(0.95);
  });
});
