"use client";

import { createContext, use, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { Icon } from "@orgasport/ui";
import { cn } from "@/components/ui/cn";
import { LOOK_INDEX, ballLookFor, type BallLook, type StageSport } from "./ballGeometry";
import { REDUCED_MOTION_QUERY, canRun3D, readDeviceHints, whenIdle } from "./loadPolicy";
import type { HeroHandle } from "./heroScene3d";
import styles from "./landingStyles";

/**
 * Full-bleed landing hero on a black night stage. The server HTML already
 * shows a static version of the scene (CSS sky, neon grid, pre-rendered ball
 * image), so text, doors and the find-my-draw form paint first. On capable
 * devices the three.js scene (heroScene3d.ts) is imported once the page is
 * idle and the hero visible, then fades in over the static one: same horizon,
 * ball drawn in the same rectangle, no layout shift. The section exposes its
 * state in `data-ball` ("static" → "loading" → "3d"; stays "static" when 3D is
 * not allowed). The sport chips set `data-sport` (accent) and the ball look.
 */

type Mode = "static" | "loading" | "3d";

type HeroState = {
  sports: StageSport[];
  active: number;
  choose: (index: number) => void;
  mode: Mode;
  anchorRef: RefObject<HTMLDivElement | null>;
};

const HeroContext = createContext<HeroState | null>(null);

function useHero(): HeroState {
  const hero = use(HeroContext);
  if (!hero) throw new Error("Hero parts must be rendered inside SportHero");
  return hero;
}

const subscribeNever = () => () => {};
const readPageSport = () => document.documentElement.getAttribute("data-sport");

export function SportHero({ sports, className, children }: { sports: StageSport[]; className?: string; children: ReactNode }) {
  // The device's sport preference (set on <html> before the first paint) picks the first ball.
  const pageSport = useSyncExternalStore(subscribeNever, readPageSport, () => null);
  const [chosen, setChosen] = useState<number | null>(null);
  const preferred = sports.findIndex((s) => s.accentToken === pageSport || s.slug === pageSport);
  const active = chosen ?? Math.max(0, preferred);
  const look = ballLookFor(sports[active]?.icon ?? "");

  const sectionRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const horizonRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HeroHandle | null>(null);
  const lookRef = useRef(LOOK_INDEX[look]);
  const [mode, setMode] = useState<Mode>("static");

  // Chip change: the 3D scene switches ball and markings and re-reads the accent of the new data-sport.
  useEffect(() => {
    lookRef.current = LOOK_INDEX[look];
    sceneRef.current?.setLook(LOOK_INDEX[look]);
  }, [look, active]);

  useEffect(() => {
    const section = sectionRef.current;
    const host = hostRef.current;
    const anchor = anchorRef.current;
    if (!section || !host || !anchor || !canRun3D(readDeviceHints(window))) return;

    let cancelled = false;
    let idle = false;
    let visible = false;
    let started = false;
    let cancelIdle = () => {};
    let observer: IntersectionObserver | null = null;

    const teardown = () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    const start = () => {
      if (started || cancelled || !idle || !visible) return;
      started = true;
      observer?.disconnect();
      setMode("loading");
      import("./heroScene3d")
        .then(({ mountHeroScene }) => {
          if (cancelled) return;
          const handle = mountHeroScene(host, {
            anchor,
            colorSource: section,
            horizon: horizonRef.current,
            look: lookRef.current,
            onReady: () => setMode("3d"),
            onLost: () => {
              teardown();
              setMode("static");
            },
          });
          sceneRef.current = handle;
          if (!handle) setMode("static");
        })
        .catch(() => {
          if (!cancelled) setMode("static");
        });
    };

    observer = new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      start();
    });
    observer.observe(section);

    // Idle = after the load event, when the main thread has nothing better to do.
    const onLoad = () => {
      cancelIdle = whenIdle(window, () => {
        idle = true;
        start();
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    // "Reduce motion" switched on while the page is open: back to the static scene.
    const motion = window.matchMedia(REDUCED_MOTION_QUERY);
    const onMotion = () => {
      if (!motion.matches) return;
      cancelled = true;
      teardown();
      setMode("static");
    };
    motion.addEventListener("change", onMotion);

    return () => {
      cancelled = true;
      cancelIdle();
      observer?.disconnect();
      window.removeEventListener("load", onLoad);
      motion.removeEventListener("change", onMotion);
      teardown();
    };
  }, []);

  return (
    <HeroContext value={{ sports, active, choose: setChosen, mode, anchorRef }}>
      <section
        ref={sectionRef}
        data-scheme="stage"
        data-sport={sports[active]?.accentToken}
        data-ball={mode}
        className={cn(styles.hero, "relative isolate overflow-hidden bg-stage text-ink")}
      >
        <div className={styles.backdrop} aria-hidden="true">
          <div className={styles.stars} />
          <div ref={horizonRef} className={styles.horizon} />
          <div className={styles.floor}>
            <StaticFloor />
          </div>
          <div ref={hostRef} className={styles.canvasHost} />
          <div className={styles.veil} />
        </div>
        <div className={className}>{children}</div>
      </section>
    </HeroContext>
  );
}

/**
 * Static neon floor (server HTML): the lanes of the 3D floor seen from the same drone height,
 * projected once at module load (vanishing point at the top centre = the horizon line).
 */
const FLOOR_PATH = (() => {
  const f = 520, camHeight = 6.4, far = 220, near = (f * camHeight) / 600;
  const px = (x: number, z: number) => `${(500 + (f * x) / z).toFixed(1)} ${((f * camHeight) / z).toFixed(1)}`;
  const parts: string[] = [];
  for (let x = -96; x <= 96; x += 4) parts.push(`M${px(x, near)}L${px(x, far)}`);
  for (let z = 8.5; z < far; z += 15) parts.push(`M-2000 ${((f * camHeight) / z).toFixed(1)}H3000`);
  return parts.join("");
})();

function StaticFloor() {
  return (
    <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMin slice" focusable="false">
      <path d={FLOOR_PATH} fill="none" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.7" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const STILLS: Partial<Record<BallLook, string>> = { steel: "/vitrine/ball.webp", panels: "/vitrine/football.webp" };

/** The ball's place in the layout: the pre-rendered still, then the 3D ball drawn in the same square. */
export function BallSpot({ description, className }: { description: string; className?: string }) {
  const { sports, active, anchorRef } = useHero();
  const sport = sports[active];
  const still = STILLS[ballLookFor(sport.icon)];
  return (
    <div ref={anchorRef} className={cn(styles.ballSpot, className)} role="img" aria-label={description.replace("{sport}", sport.name)}>
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element -- a fixed, pre-sized still: no optimizer round trip
        <img key={still} src={still} alt="" width={560} height={560} decoding="async" className={styles.still} />
      ) : (
        <span className={cn(styles.still, styles.plainBall)} />
      )}
    </div>
  );
}

export type SportChipsLabels = { eyebrow: string; chips: string; hint: string };

export function SportChips({ labels, className }: { labels: SportChipsLabels; className?: string }) {
  const { sports, active, choose, mode } = useHero();
  return (
    <div className={cn("grid justify-items-center gap-2 text-center", className)}>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">{labels.eyebrow}</p>
      <div role="group" aria-label={labels.chips} className="flex flex-wrap justify-center gap-2">
        {sports.map((s, i) => {
          const on = i === active;
          return (
            <button
              key={s.slug}
              type="button"
              data-sport={s.accentToken}
              aria-pressed={on}
              onClick={() => choose(i)}
              className={cn(
                styles.chip,
                "inline-flex min-h-12 items-center gap-2 rounded-full border-2 px-4 text-base font-bold",
                on ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-ink hover:border-accent",
              )}
            >
              <Icon name={s.icon} size={22} />
              {s.name}
            </button>
          );
        })}
      </div>
      <p className={cn("text-sm text-ink-soft", mode !== "3d" && "invisible")}>{labels.hint}</p>
    </div>
  );
}
