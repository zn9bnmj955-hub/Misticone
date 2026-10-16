import { describe, expect, it } from "vitest";
import { POINTER_DEAD_ZONE, cameraPose, damp, fixedPixelRatio, pointerTarget } from "./heroMotion";

/** Runs `damp` for `seconds` at `fps` images per second. */
function run(fps: number, seconds: number, from = 0, to = 1, rate = 2.5) {
  let v = from;
  for (let i = 0; i < Math.round(fps * seconds); i++) v = damp(v, to, rate, 1 / fps);
  return v;
}

describe("hero motion", () => {
  it("smooths the same way at 30, 60 and 144 images per second", () => {
    const at60 = run(60, 0.5);
    expect(Math.abs(run(30, 0.5) - at60)).toBeLessThan(1e-9);
    expect(Math.abs(run(144, 0.5) - at60)).toBeLessThan(1e-9);
  });

  it("lands exactly on its target and then never moves again", () => {
    const settled = run(60, 6);
    expect(settled).toBe(1);
    expect(damp(settled, 1, 2.5, 1 / 60)).toBe(1);
  });

  it("ignores tiny pointer moves (dead zone) but follows real ones", () => {
    const start = { x: 0.2, y: -0.1 };
    expect(pointerTarget(start, 0.2 + POINTER_DEAD_ZONE / 2, -0.1)).toBe(start);
    expect(pointerTarget(start, 0.4, -0.1)).toEqual({ x: 0.4, y: -0.1 });
  });

  it("places the camera from the pointer and the scroll only (no clock)", () => {
    expect(cameraPose(0, 0, 0)).toEqual({ x: 0, y: 6.4, z: 16, yaw: 0 });
    expect(cameraPose(0.5, -0.2, 0.5)).toEqual(cameraPose(0.5, -0.2, 0.5));
    expect(cameraPose(0, 0, 1).z).toBeLessThan(cameraPose(0, 0, 0).z);
  });

  it("uses a fixed pixel ratio of at most 2 (1.5 on touch screens)", () => {
    expect(fixedPixelRatio(3, false)).toBe(2);
    expect(fixedPixelRatio(3, true)).toBe(1.5);
    expect(fixedPixelRatio(1, false)).toBe(1);
    expect(fixedPixelRatio(undefined, false)).toBe(1);
  });
});
