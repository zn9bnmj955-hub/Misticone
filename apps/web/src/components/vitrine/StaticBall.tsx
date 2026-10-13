import {
  BALL_RADIUS,
  BALL_TILT,
  GROOVE_OFFSETS,
  ICO_EDGES,
  ICO_VERTICES,
  normalize,
  rotate,
  rotationMatrix,
  truncationPoint,
  type BallLook,
  type Vec3,
} from "./ballGeometry";

/**
 * The ball drawn in SVG, in the same orientation as the 3D ball's first frame:
 * shown immediately (no layout shift), and kept when 3D is not loaded
 * (reduced motion, small devices, save-data). Colors are design tokens.
 */

const SIZE = 200;
const C = SIZE / 2;
const R = C * BALL_RADIUS;
const M = rotationMatrix(BALL_TILT);

/** Projects a point of the unit sphere; hidden points are pushed onto the outline. */
function project(v: Vec3, clampToLimb = true): [number, number, boolean] {
  const w = rotate(M, v);
  let x = w[0];
  let y = w[1];
  const visible = w[2] >= 0;
  if (!visible && clampToLimb) {
    const l = Math.hypot(x, y) || 1;
    x /= l;
    y /= l;
  }
  return [C + R * x, C - R * y, visible];
}

const n = (v: number) => Math.round(v * 10) / 10;

/** Great-circle samples between two unit vectors. */
function arc(a: Vec3, b: Vec3, steps: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push(normalize([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]));
  }
  return out;
}

/** SVG path of the visible parts of a list of sphere points. */
function visiblePath(points: Vec3[], closed = false): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    const [x, y, visible] = project(p, false);
    if (!visible) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${n(x)} ${n(y)}`;
    pen = true;
  }
  return closed && d ? `${d}Z` : d;
}

function steelGrooves(): string {
  return GROOVE_OFFSETS.map((o) => {
    const r = Math.sqrt(1 - o * o);
    const pts: Vec3[] = [];
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * Math.PI * 2;
      pts.push([o, r * Math.cos(t), r * Math.sin(t)]);
    }
    return visiblePath(pts);
  }).join("");
}

function footballPanels(): { pentagons: string; seams: string } {
  let pentagons = "";
  ICO_VERTICES.forEach((center, i) => {
    if (rotate(M, normalize(center))[2] < -0.45) return;
    const corners = ICO_EDGES.filter(([a, b]) => a === i || b === i).map(([a, b]) => truncationPoint(i, a === i ? b : a));
    // Order the five corners around the center.
    const c = normalize(center);
    const ref = corners[0];
    const u = normalize([ref[0] - c[0], ref[1] - c[1], ref[2] - c[2]]);
    const v: Vec3 = [c[1] * u[2] - c[2] * u[1], c[2] * u[0] - c[0] * u[2], c[0] * u[1] - c[1] * u[0]];
    corners.sort(
      (p, q) =>
        Math.atan2(p[0] * v[0] + p[1] * v[1] + p[2] * v[2], p[0] * u[0] + p[1] * u[1] + p[2] * u[2]) -
        Math.atan2(q[0] * v[0] + q[1] * v[1] + q[2] * v[2], q[0] * u[0] + q[1] * u[1] + q[2] * u[2]),
    );
    const outline: Vec3[] = [];
    corners.forEach((p, k) => outline.push(...arc(p, corners[(k + 1) % 5], 6)));
    pentagons += outline.map((p, k) => {
      const [x, y] = project(p);
      return `${k ? "L" : "M"}${n(x)} ${n(y)}`;
    }).join("") + "Z";
  });
  const seams = ICO_EDGES.map(([a, b]) => visiblePath(arc(truncationPoint(a, b), truncationPoint(b, a), 6))).join("");
  return { pentagons, seams };
}

const GROOVES = steelGrooves();
const PANELS = footballPanels();

const stage = "var(--os-stage)";
const light = "var(--os-on-stage)";

export function StaticBall({ look, className }: { look: BallLook; className?: string }) {
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={className} aria-hidden="true" focusable="false" data-look={look}>
      <defs>
        <radialGradient id="os-ball-shade" cx="36%" cy="30%" r="78%">
          <stop offset="0" style={{ stopColor: stage, stopOpacity: 0 }} />
          <stop offset="0.55" style={{ stopColor: stage, stopOpacity: 0.12 }} />
          <stop offset="1" style={{ stopColor: stage, stopOpacity: 0.7 }} />
        </radialGradient>
        <radialGradient id="os-ball-steel" cx="38%" cy="32%" r="80%">
          <stop offset="0" style={{ stopColor: light, stopOpacity: 1 }} />
          <stop offset="0.3" style={{ stopColor: light, stopOpacity: 0.82 }} />
          <stop offset="0.62" style={{ stopColor: light, stopOpacity: 0.42 }} />
          <stop offset="0.86" style={{ stopColor: light, stopOpacity: 0.62 }} />
          <stop offset="1" style={{ stopColor: light, stopOpacity: 0.3 }} />
        </radialGradient>
        <radialGradient id="os-ball-spec" cx="50%" cy="50%" r="50%">
          <stop offset="0" style={{ stopColor: light, stopOpacity: 0.95 }} />
          <stop offset="1" style={{ stopColor: light, stopOpacity: 0 }} />
        </radialGradient>
        <clipPath id="os-ball-clip">
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>
      {look === "steel" && (
        <g clipPath="url(#os-ball-clip)">
          <circle cx={C} cy={C} r={R} style={{ fill: stage }} />
          <circle cx={C} cy={C} r={R} fill="url(#os-ball-steel)" />
          <path d={GROOVES} fill="none" style={{ stroke: stage, strokeOpacity: 0.55 }} strokeWidth={3} strokeLinecap="round" />
          <path d={GROOVES} fill="none" style={{ stroke: light, strokeOpacity: 0.55 }} strokeWidth={1} transform="translate(0.9 1.1)" />
        </g>
      )}
      {look === "panels" && (
        <g clipPath="url(#os-ball-clip)">
          <circle cx={C} cy={C} r={R} style={{ fill: light }} />
          <path d={PANELS.pentagons} style={{ fill: stage, fillOpacity: 0.92 }} />
          <path d={PANELS.seams} fill="none" style={{ stroke: stage, strokeOpacity: 0.35 }} strokeWidth={1.4} />
          <circle cx={C} cy={C} r={R} fill="url(#os-ball-shade)" />
        </g>
      )}
      {look === "plain" && (
        <g clipPath="url(#os-ball-clip)">
          <circle cx={C} cy={C} r={R} className="fill-accent" />
          <circle cx={C} cy={C} r={R} fill="url(#os-ball-shade)" />
        </g>
      )}
      <ellipse cx={C - R * 0.36} cy={C - R * 0.42} rx={R * 0.26} ry={R * 0.15} transform={`rotate(-32 ${C - R * 0.36} ${C - R * 0.42})`} fill="url(#os-ball-spec)" />
      <circle cx={C} cy={C} r={R - 0.5} fill="none" style={{ stroke: light, strokeOpacity: 0.18 }} strokeWidth={1} />
    </svg>
  );
}
