/**
 * Motion maths of the 3D hero, kept pure so it can be tested without WebGL.
 *
 * Rules (a still page must give a still picture, whatever the frame rate):
 * - smoothing is exponential and uses the frame duration (same path at 30, 60 or
 *   144 images per second) and snaps onto its target once closer than SNAP, so the
 *   camera really stops instead of drifting by invisible sub-pixel amounts;
 * - the pointer has a dead zone: tiny moves (hand tremor, sensor noise) are ignored;
 * - the camera depends only on the pointer and the scroll, never on the clock.
 */

/** Distance under which a smoothed value lands exactly on its target. */
export const SNAP = 1e-4;
/** Pointer moves smaller than this (in -1..1 screen units, about 0.5 % of the screen) are ignored. */
export const POINTER_DEAD_ZONE = 0.01;

/** Frame-rate independent exponential smoothing: `rate` is in 1/s. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  const next = target + (current - target) * Math.exp(-rate * Math.max(0, dt));
  return Math.abs(next - target) < SNAP ? target : next;
}

/** New pointer target, or the previous one when the move stays inside the dead zone. */
export function pointerTarget(prev: { x: number; y: number }, x: number, y: number): { x: number; y: number } {
  return Math.hypot(x - prev.x, y - prev.y) < POINTER_DEAD_ZONE ? prev : { x, y };
}

export type CameraPose = { x: number; y: number; z: number; yaw: number };

/** Drone camera: pointer parallax + dolly while the hero scrolls away (scroll in 0..1). */
export function cameraPose(pointerX: number, pointerY: number, scroll: number): CameraPose {
  return {
    x: pointerX * 1.5,
    y: 6.4 - pointerY * 0.5 - scroll * 2.4,
    z: 16 - scroll * 12,
    yaw: pointerX * 0.05,
  };
}

/** Fixed device pixel ratio for the whole life of the canvas (at most 2, 1.5 on touch screens). */
export function fixedPixelRatio(devicePixelRatio: number | undefined, coarse: boolean): number {
  return Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2);
}
