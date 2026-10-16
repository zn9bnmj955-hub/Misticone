/**
 * The landing's 3D hero (plain three.js, loaded lazily by SportHero after the
 * page is idle and visible; never on the critical path). One WebGL canvas:
 *
 * - a night boulodrome seen from a drone: neon lane lines (pétanque) or pitch
 *   markings (football) drawn by one floor shader with a built-in glow (lines and
 *   floor are the same surface: nothing to z-fight), floodlight pylons with light
 *   cones, light particles, stars;
 * - the photorealistic ball (ballModel.ts) drawn in a second pass inside the
 *   rectangle of the page's ball anchor, so it sits exactly where the static
 *   pre-rendered image was (no layout shift, seamless hand-off).
 *
 * The camera follows the pointer and dollies forward while the hero is scrolled
 * past; nothing in the décor depends on the clock, so a still page gives a still
 * picture (no shimmer, no blinking): only the ball turns. Smoothing is
 * frame-rate independent (heroMotion.ts). Rendering pauses off-screen and when
 * the tab is hidden; the pixel ratio is fixed at mount (2 at most, 1.5 on touch
 * devices); MSAA is on; shaders output tone-mapped sRGB like the built-in
 * materials. Everything is disposed on unmount. Colours come from the design
 * tokens of the hero element.
 */
import {
  CustomBlending,
  OneFactor,
  ZeroFactor,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { cameraPose, damp, fixedPixelRatio, pointerTarget } from "./heroMotion";
import { REST_SPIN, createBall, createEnvironment, frameBallCamera, poseBall, readStageColors, type StageColors } from "./ballModel";

export type HeroOptions = {
  /** Element whose rectangle receives the ball (the static image sits there). */
  anchor: HTMLElement;
  /** Element giving the colour tokens and the static horizon (the hero section). */
  colorSource: HTMLElement;
  /** Static horizon line of the CSS scene (the 3D horizon is aligned on it). */
  horizon: HTMLElement | null;
  /** LOOK_INDEX of the first ball. */
  look: number;
  onReady: () => void;
  onLost: () => void;
};

export type HeroHandle = {
  /** Switches the ball (and the floor markings) and re-reads the accent colour. */
  setLook(look: number): void;
  dispose(): void;
};

const FLOOR_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FLOOR_FRAG = /* glsl */ `
uniform float uPitch;
uniform vec3 uLine;
uniform vec3 uAccent;
varying vec3 vWorld;

float dist(float v, float period) { return abs(fract(v / period + 0.5) - 0.5) * period; }
// Neon line: sharp core + soft halo (a cheap bloom without post-processing).
float neon(float d, float w) {
  float fw = fwidth(d) + 1e-4;
  float core = 1.0 - smoothstep(w, w + fw * 1.5, d);
  return core + exp(-d * 5.5) * 0.28 * (1.0 - smoothstep(0.4, 2.5, fw));
}

void main() {
  vec2 p = vWorld.xz;
  float far = length(vWorld - cameraPosition);
  float fwx = fwidth(p.x);
  float fine = (1.0 - smoothstep(0.08, 0.35, fwx));

  // Minor grid (1 m), fades out in the distance to avoid moiré.
  float minor = max(1.0 - smoothstep(0.0, fwidth(p.x) * 1.2, dist(p.x, 1.0)),
                    1.0 - smoothstep(0.0, fwidth(p.y) * 1.2, dist(p.y, 1.0))) * 0.06 * fine;

  // Pétanque: lanes 4 m wide, 15 m long.
  float lanes = max(neon(dist(p.x, 4.0), 0.035), neon(dist(p.y + 7.5, 15.0), 0.035) * 0.8);
  // Football: touchlines, halfway line, centre circle, penalty boxes, mowing stripes.
  vec2 q = p - vec2(0.0, -24.0);
  float pitch = neon(abs(abs(q.x) - 30.0), 0.06);
  pitch = max(pitch, neon(abs(q.y), 0.06));
  pitch = max(pitch, neon(abs(length(q) - 9.15), 0.06));
  pitch = max(pitch, neon(abs(abs(q.y) - 45.0), 0.06));
  vec2 box = abs(q) - vec2(20.0, 28.5);
  pitch = max(pitch, neon(abs(max(box.x, -box.y)), 0.05) * step(abs(q.x), 20.1) * step(28.4, abs(q.y)));
  float stripes = step(0.5, fract(q.y / 10.0)) * 0.05 * step(abs(q.x), 30.0) * step(abs(q.y), 45.0);
  float marks = mix(lanes, pitch, uPitch);

  vec3 col = uLine * (minor + marks) + uAccent * (stripes * uPitch);
  // Light pool in front of the camera.
  col += uAccent * 0.02 * exp(-dot(p - vec2(0.0, -4.0), p - vec2(0.0, -4.0)) * 0.004);
  float fog = exp(-far * 0.028);
  gl_FragColor = vec4(col * fog, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const POINTS_VERT = /* glsl */ `
attribute float aSeed;
uniform float uScale;
uniform float uRise;
varying float vAlpha;
void main() {
  // Fixed positions and brightness (no twinkle): a still page stays still.
  vec3 pos = position;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  float shade = 0.55 + 0.45 * fract(aSeed * 7.31);
  vAlpha = shade * (uRise > 0.0 ? smoothstep(0.0, 2.0, pos.y) * (1.0 - smoothstep(9.0, 14.0, pos.y)) : 1.0);
  gl_PointSize = uRise > 0.0 ? uScale * (0.6 + aSeed) * 26.0 / -mv.z : uScale * (0.6 + aSeed * 1.2);
  gl_Position = projectionMatrix * mv;
}`;

const POINTS_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = exp(-d * d * 5.0) * (1.0 - step(1.0, d));
  gl_FragColor = vec4(uColor * a * vAlpha, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float a = pow(vUv.y, 1.5) * 0.8 + 0.06;
  gl_FragColor = vec4(uColor * a * 0.03, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  // Light-only blending ignores alpha: the glow fades to black, not to transparent.
  g.addColorStop(0, "rgb(255,255,255)");
  g.addColorStop(0.2, "rgb(110,110,110)");
  g.addColorStop(1, "rgb(0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function randomPoints(count: number, seed: number, place: (r: () => number) => [number, number, number]) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set(place(r), i * 3);
    seeds[i] = r();
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  return g;
}

/**
 * Light-only blending: adds colour without touching the canvas alpha, so the glow
 * lands on the CSS sky behind the (transparent) canvas instead of hiding it.
 */
export const ADD_LIGHT = { blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor } as const;

export function mountHeroScene(host: HTMLElement, options: HeroOptions): HeroHandle | null {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-ball-canvas", "");
  canvas.setAttribute("aria-hidden", "true");

  const coarse = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
  const dpr = fixedPixelRatio(window.devicePixelRatio, coarse);
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  host.appendChild(canvas);

  const colors: StageColors = readStageColors(options.colorSource);
  const lineColor = new Color();
  const mixLine = () => lineColor.copy(colors.line).lerp(colors.accent, 0.35);
  mixLine();

  // ---- Night boulodrome ------------------------------------------------------
  const scene = new Scene();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);

  const floorUniforms = {
    uPitch: { value: options.look === 1 ? 1 : 0 },
    uLine: { value: lineColor },
    uAccent: { value: colors.accent },
  };
  const floor = new Mesh(
    track(new PlaneGeometry(400, 400)),
    track(new ShaderMaterial({ vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, uniforms: floorUniforms, ...ADD_LIGHT, transparent: true, depthWrite: false })),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const pointMaterial = (color: Color, scale: number, rise: number) =>
    track(
      new ShaderMaterial({
        vertexShader: POINTS_VERT,
        fragmentShader: POINTS_FRAG,
        uniforms: { uScale: { value: scale * dpr }, uRise: { value: rise }, uColor: { value: color } },
        ...ADD_LIGHT,
        transparent: true,
        depthWrite: false,
      }),
    );
  const stars = new Points(
    track(
      randomPoints(coarse ? 260 : 520, 7, (r) => {
        const a = r() * Math.PI * 2, h = 0.03 + r() ** 1.6 * 0.6;
        return [Math.cos(a) * 180, h * 180, Math.sin(a) * 180 - 40];
      }),
    ),
    pointMaterial(colors.light, 2.2, 0),
  );
  scene.add(stars);
  const particleColor = colors.light.clone().lerp(colors.accent, 0.6);
  const particles = new Points(
    track(randomPoints(coarse ? 160 : 340, 11, (r) => [(r() - 0.5) * 60, r() * 14, -r() * 70 + 10])),
    pointMaterial(particleColor, 1.4, 0.35),
  );
  scene.add(particles);

  // Floodlight pylons: a glowing head and a cone of light on the pitch.
  const glow = track(glowTexture());
  const beamColor = colors.light.clone().lerp(colors.accent, 0.5);
  const beamGeometry = track(new ConeGeometry(7, 15, 32, 1, true));
  const beamMaterial = track(
    new ShaderMaterial({ vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, uniforms: { uColor: { value: beamColor } }, ...ADD_LIGHT, transparent: true, depthWrite: false }),
  );
  const headMaterial = track(new SpriteMaterial({ map: glow, color: beamColor, ...ADD_LIGHT, depthWrite: false, transparent: true }));
  const poleMaterial = track(new MeshBasicMaterial({ color: lineColor.clone().multiplyScalar(0.55) }));
  const poleGeometry = track(new PlaneGeometry(0.12, 15));
  for (const [x, z] of [[-24, -14], [24, -14], [-24, -46], [24, -46]] as const) {
    const pole = new Mesh(poleGeometry, poleMaterial);
    pole.position.set(x, 7.5, z);
    scene.add(pole);
    const head = new Sprite(headMaterial);
    head.position.set(x, 15, z);
    head.scale.setScalar(7);
    scene.add(head);
    const beam = new Mesh(beamGeometry, beamMaterial);
    const tilt = -Math.sign(x) * 0.42;
    beam.rotation.z = tilt;
    beam.position.set(x + 7.5 * Math.sin(tilt), 15 - 7.5 * Math.cos(tilt), z);
    scene.add(beam);
  }

  const camera = new PerspectiveCamera(50, 1, 0.1, 400);

  // ---- The ball (second pass in the anchor rectangle) ---------------------------
  const ballScene = new Scene();
  const env = createEnvironment(renderer, colors);
  ballScene.environment = env.texture;
  const ballModel = createBall(options.look, colors.accent, {
    textureSize: coarse ? 1024 : 2048,
    maxAnisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });
  ballScene.add(ballModel.group);
  const ballCamera = new PerspectiveCamera(24, 1, 0.1, 50);
  frameBallCamera(ballCamera);
  let spinAngle = REST_SPIN;
  let velocity = 0.35; // rad/s around Y
  let pitchAngle = 0;

  // ---- Interaction ------------------------------------------------------------
  const pointer = { x: 0, y: 0 };
  let target = { x: 0, y: 0 };
  const onPointerMove = (e: PointerEvent) => {
    target = pointerTarget(target, (e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  const anchor = options.anchor;
  let drag: { x: number; y: number; t: number } | null = null;
  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    anchor.setPointerCapture?.(e.pointerId);
    anchor.setAttribute("data-dragging", "");
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const now = performance.now();
    const dt = Math.max(8, now - drag.t) / 1000;
    const size = anchor.clientWidth || 1;
    velocity = (((e.clientX - drag.x) / size) * 4) / dt;
    spinAngle += ((e.clientX - drag.x) / size) * 4;
    pitchAngle = Math.max(-0.9, Math.min(0.9, pitchAngle + ((e.clientY - drag.y) / size) * 4));
    drag = { x: e.clientX, y: e.clientY, t: now };
  };
  const onUp = () => {
    drag = null;
    anchor.removeAttribute("data-dragging");
  };
  anchor.addEventListener("pointerdown", onDown);
  anchor.addEventListener("pointermove", onMove);
  anchor.addEventListener("pointerup", onUp);
  anchor.addEventListener("pointercancel", onUp);

  // ---- Size, visibility, loop ---------------------------------------------------
  let width = 0, height = 0;
  const resize = () => {
    width = host.clientWidth;
    height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Taller than wide (phones): widen the vertical field of view to keep the pitch wide.
    camera.fov = camera.aspect >= 1 ? 50 : Math.min(82, 50 + (1 - camera.aspect) * 46);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let onScreen = true;
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    schedule();
  });
  io.observe(host);
  const onVisibility = () => schedule();
  document.addEventListener("visibilitychange", onVisibility);

  let pitchTarget = floorUniforms.uPitch.value;
  let morph = 0; // 0..1 progress of a look switch (scale dip)
  let pendingLook: number | null = null;
  let frame = 0;
  let last = performance.now();
  let ready = false;
  let disposed = false;
  const camPos = new Vector3();
  const look = new Vector3();

  function horizonFraction(): number {
    if (!options.horizon || !height) return 0.3;
    const hr = options.horizon.getBoundingClientRect();
    const cr = host.getBoundingClientRect();
    return Math.min(0.6, Math.max(0.08, (hr.top - cr.top) / height));
  }

  function render(now: number) {
    frame = 0;
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pointer.x = damp(pointer.x, target.x, 2.5, dt);
    pointer.y = damp(pointer.y, target.y, 2.5, dt);
    floorUniforms.uPitch.value = damp(floorUniforms.uPitch.value, pitchTarget, 3, dt);

    // Drone camera: pointer parallax + dolly while the hero scrolls away (no clock-driven drift).
    const rect = host.getBoundingClientRect();
    const scroll = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height)));
    const hFrac = horizonFraction();
    const pitch = Math.atan((0.5 - hFrac) * 2 * Math.tan((camera.fov * Math.PI) / 360));
    const pose = cameraPose(pointer.x, pointer.y, scroll);
    camPos.set(pose.x, pose.y, pose.z);
    camera.position.copy(camPos);
    const yaw = pose.yaw;
    look.set(camPos.x + Math.sin(yaw) * 10, camPos.y - Math.tan(pitch) * 10, camPos.z - Math.cos(yaw) * 10);
    camera.lookAt(look);

    renderer.setViewport(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.render(scene, camera);

    // Ball: spin, drag inertia, look switch.
    if (!drag) {
      velocity = damp(velocity, 0.35, 1.5, dt);
      pitchAngle = damp(pitchAngle, 0, 1.2, dt);
      spinAngle += velocity * dt;
    }
    if (pendingLook !== null || morph > 0) {
      morph += dt / 0.7;
      if (pendingLook !== null && morph >= 0.5) {
        ballModel.setLook(pendingLook, colors.accent);
        pendingLook = null;
      }
      if (morph >= 1) morph = 0;
    }
    const dip = morph > 0 ? 1 - Math.sin(morph * Math.PI) * 0.12 : 1;
    poseBall(ballModel.ball, spinAngle + (morph > 0 ? Math.sin(morph * Math.PI) * 2.5 : 0), pitchAngle);
    ballModel.ball.scale.setScalar(dip);
    ballModel.ball.position.y = dip - 1;

    const a = anchor.getBoundingClientRect();
    const size = Math.max(a.width, a.height);
    const x = a.left - rect.left;
    const y = a.top - rect.top;
    if (size > 0 && y < height && y + size > 0) {
      renderer.setViewport(x, height - y - size, size, size);
      renderer.setScissor(x, height - y - size, size, size);
      renderer.setScissorTest(true);
      renderer.clearDepth();
      renderer.render(ballScene, ballCamera);
      renderer.setScissorTest(false);
    }

    if (!ready) {
      ready = true;
      canvas.setAttribute("data-ready", "");
      options.onReady();
    }
    schedule();
  }

  function schedule() {
    if (disposed || frame || !onScreen || document.hidden) return;
    last = performance.now();
    frame = requestAnimationFrame(render);
  }

  const onContextLost = (e: Event) => {
    e.preventDefault();
    options.onLost();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  schedule();

  return {
    setLook(next) {
      readStageColors(options.colorSource, colors);
      mixLine();
      poleMaterial.color.copy(lineColor).multiplyScalar(0.55);
      beamColor.copy(colors.light).lerp(colors.accent, 0.5);
      particleColor.copy(colors.light).lerp(colors.accent, 0.6);
      headMaterial.color.copy(beamColor);
      pitchTarget = next === 1 ? 1 : 0;
      pendingLook = next;
      morph = morph > 0 ? morph : 0.0001;
      schedule();
    },
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
      anchor.removeEventListener("pointerdown", onDown);
      anchor.removeEventListener("pointermove", onMove);
      anchor.removeEventListener("pointerup", onUp);
      anchor.removeEventListener("pointercancel", onUp);
      anchor.removeAttribute("data-dragging");
      canvas.removeEventListener("webglcontextlost", onContextLost);
      ballModel.dispose();
      env.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
}
