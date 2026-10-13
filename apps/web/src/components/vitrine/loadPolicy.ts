/**
 * When may the landing load its 3D ball? Only on capable devices, never when
 * the visitor asked for reduced motion or to save data, and only once the page
 * is idle and the ball is on screen (see SportHero).
 */

export type DeviceHints = {
  reducedMotion: boolean;
  webgl2: boolean;
  /** navigator.hardwareConcurrency (undefined when the browser hides it). */
  cores?: number;
  /** navigator.deviceMemory in GB (Chromium only; undefined elsewhere). */
  memory?: number;
  /** navigator.connection.saveData */
  saveData?: boolean;
};

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function canRun3D(h: DeviceHints): boolean {
  if (h.reducedMotion || !h.webgl2 || h.saveData === true) return false;
  if (typeof h.cores !== "number" || h.cores < 4) return false;
  return h.memory === undefined || h.memory >= 4;
}

type NavigatorHints = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

export function readDeviceHints(win: Window): DeviceHints {
  const nav = win.navigator as NavigatorHints;
  return {
    reducedMotion: typeof win.matchMedia === "function" && win.matchMedia(REDUCED_MOTION_QUERY).matches,
    // Cheap check (no context created); the 3D module still falls back if the context fails.
    webgl2: "WebGL2RenderingContext" in win,
    cores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : undefined,
    memory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
    saveData: nav.connection?.saveData === true,
  };
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Runs `cb` once the page is idle (fallback: 1.5 s timer). Returns a cancel function. */
export function whenIdle(win: Window, cb: () => void): () => void {
  const w = win as IdleWindow;
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(cb, { timeout: 4000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = win.setTimeout(cb, 1500);
  return () => win.clearTimeout(id);
}
