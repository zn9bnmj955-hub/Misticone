"use client";

import { createContext, use, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Icon } from "@orgasport/ui";
import { cn } from "@/components/ui/cn";
import { LOOK_INDEX, ballLookFor, type StageSport } from "./ballGeometry";
import { REDUCED_MOTION_QUERY, canRun3D, readDeviceHints, whenIdle } from "./loadPolicy";
import { StaticBall } from "./StaticBall";
import type { BallHandle } from "./sportBall3d";
import styles from "./landing.module.css";

/**
 * Landing hero: the sport chosen in the stage sets `data-sport` on the hero
 * element (accent of the title, buttons and ball). The 3D ball is loaded
 * lazily on capable devices only; the stage exposes its state in `data-ball`
 * ("static" → "loading" → "3d"; stays "static" when 3D is not allowed).
 */

type HeroState = { sports: StageSport[]; active: number; choose: (index: number) => void };

const HeroContext = createContext<HeroState | null>(null);

const subscribeNever = () => () => {};
const readPageSport = () => document.documentElement.getAttribute("data-sport");

export function SportHero({
  sports,
  className,
  children,
}: {
  sports: StageSport[];
  className?: string;
  children: ReactNode;
}) {
  // The device's sport preference (set on <html> before the first paint) picks the first ball.
  const pageSport = useSyncExternalStore(subscribeNever, readPageSport, () => null);
  const [chosen, setChosen] = useState<number | null>(null);
  const preferred = sports.findIndex((s) => s.accentToken === pageSport || s.slug === pageSport);
  const active = chosen ?? Math.max(0, preferred);
  return (
    <HeroContext value={{ sports, active, choose: setChosen }}>
      <section data-sport={sports[active]?.accentToken} className={className}>
        {children}
      </section>
    </HeroContext>
  );
}

export type SportStageLabels = { eyebrow: string; chips: string; hint: string; description: string };

type Mode = "static" | "loading" | "3d";

export function SportStage({ labels, className }: { labels: SportStageLabels; className?: string }) {
  const hero = use(HeroContext);
  if (!hero) throw new Error("SportStage must be rendered inside SportHero");
  const { sports, active, choose } = hero;
  const sport = sports[active];
  const look = ballLookFor(sport.icon);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<BallHandle | null>(null);
  const lookRef = useRef(LOOK_INDEX[look]);
  const [mode, setMode] = useState<Mode>("static");

  // Chip change: morph the 3D ball (it re-reads the accent of the new data-sport).
  useEffect(() => {
    lookRef.current = LOOK_INDEX[look];
    ballRef.current?.setLook(LOOK_INDEX[look]);
  }, [look, active]);

  useEffect(() => {
    const stage = stageRef.current;
    const host = canvasHostRef.current;
    if (!stage || !host || !canRun3D(readDeviceHints(window))) return;

    let cancelled = false;
    let idle = false;
    let visible = false;
    let started = false;
    let cancelIdle = () => {};
    let observer: IntersectionObserver | null = null;

    const teardown = () => {
      ballRef.current?.dispose();
      ballRef.current = null;
    };
    const start = () => {
      if (started || cancelled || !idle || !visible) return;
      started = true;
      observer?.disconnect();
      setMode("loading");
      import("./sportBall3d")
        .then(({ mountSportBall }) => {
          if (cancelled) return;
          const handle = mountSportBall(host, {
            look: lookRef.current,
            colorSource: stage,
            onReady: () => setMode("3d"),
            onLost: () => {
              teardown();
              setMode("static");
            },
          });
          ballRef.current = handle;
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
    observer.observe(host);

    // Idle = after the load event, when the main thread has nothing better to do.
    const onLoad = () => {
      cancelIdle = whenIdle(window, () => {
        idle = true;
        start();
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    // "Reduce motion" switched on while the page is open: back to the static ball.
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
    <div
      ref={stageRef}
      data-ball={mode}
      className={cn(
        styles.stage,
        "relative grid gap-4 overflow-hidden rounded-[var(--radius-lg)] bg-stage p-5 text-on-stage sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-6",
        className,
      )}
    >
      <div className={styles.ballBox} role="img" aria-label={labels.description.replace("{sport}", sport.name)}>
        <span className={styles.glow} aria-hidden="true" />
        <div className={styles.float}>
          <StaticBall key={look} look={look} className={styles.staticBall} />
          <div ref={canvasHostRef} className={styles.canvasHost} />
        </div>
      </div>
      <div className="grid gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-on-stage/80">{labels.eyebrow}</p>
        <div role="group" aria-label={labels.chips} className="flex flex-wrap gap-2">
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
                  on ? "border-accent bg-accent text-on-accent" : "border-on-stage/35 text-on-stage hover:border-accent",
                )}
              >
                <Icon name={s.icon} size={22} />
                {s.name}
              </button>
            );
          })}
        </div>
        <p className={cn("text-sm text-on-stage/80", mode !== "3d" && "invisible")}>{labels.hint}</p>
      </div>
    </div>
  );
}
