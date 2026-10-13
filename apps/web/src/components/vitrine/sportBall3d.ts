/**
 * The landing's 3D ball (plain three.js, loaded lazily by SportStage, never on
 * the critical path). One sphere, one shader: polished steel pétanque ball with
 * engraved grooves ↔ football panels ↔ plain accent ball, switched with a
 * glowing wipe. Procedural only (no model, no texture file); colors come from
 * the design tokens of the hero element. Rendering pauses off-screen and when
 * the tab is hidden; everything is disposed on unmount.
 */
import {
  BackSide,
  BoxGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { BALL_RADIUS, BALL_TILT, GROOVE_OFFSETS, HEXAGON_CENTERS, PENTAGON_CENTERS } from "./ballGeometry";

export type BallOptions = {
  /** LOOK_INDEX of the first look. */
  look: number;
  /** Element whose CSS tokens (--os-stage, --os-on-stage, --os-accent) color the ball. */
  colorSource: Element;
  onReady: () => void;
  onLost: () => void;
};

export type BallHandle = {
  /** Morphs to another look (and re-reads the accent color). */
  setLook(look: number): void;
  dispose(): void;
};

const FOV = 30;
const MORPH_MS = 1100;
const AUTO_SPIN = new Vector3(0.08, 0.42, 0); // rad/s, world axes
const SPIN_BOOST = 5.5; // rad/s added around Y on a morph

const FRAG_PARS = /* glsl */ `
varying vec3 vOsPos;
uniform float uFrom;
uniform float uTo;
uniform float uProgress;
uniform vec3 uLight;
uniform vec3 uDark;
uniform vec3 uAccent;
uniform vec3 uPent[12];
uniform vec3 uHex[20];

struct OsSurface { vec3 color; float rough; float metal; float height; };

float osGroove(float d) {
  return 1.0 - smoothstep(0.0, 1.0, abs(d) / 0.02);
}

OsSurface osSteel(vec3 p) {
  float g = 0.0;
  ${GROOVE_OFFSETS.map((o) => `g = max(g, osGroove(p.x - ${o.toFixed(3)}));`).join("\n  ")}
  float polish = 0.5 + 0.5 * sin(p.x * 7.0 + p.y * 11.0) * sin(p.z * 9.0 - p.y * 5.0);
  OsSurface s;
  s.color = uLight * mix(0.8, 0.3, g);
  s.rough = mix(0.12 + 0.1 * polish, 0.55, g);
  s.metal = 1.0;
  s.height = -0.006 * g;
  return s;
}

OsSurface osPanels(vec3 p) {
  float bp = -2.0;
  for (int i = 0; i < 12; i++) bp = max(bp, dot(p, uPent[i]));
  float h1 = -2.0;
  float h2 = -2.0;
  for (int i = 0; i < 20; i++) {
    float d = dot(p, uHex[i]);
    if (d > h1) { h2 = h1; h1 = d; } else if (d > h2) { h2 = d; }
  }
  // Weighted spherical Voronoi: pentagons are slightly smaller than hexagons.
  float aP = acos(clamp(bp, -1.0, 1.0)) + 0.0387;
  float aH1 = acos(clamp(h1, -1.0, 1.0)) - 0.0387;
  float aH2 = acos(clamp(h2, -1.0, 1.0)) - 0.0387;
  float pent = step(aP, aH1);
  float edge = pent > 0.5 ? aH1 - aP : min(aH2 - aH1, aP - aH1);
  float seam = 1.0 - smoothstep(0.008, 0.028, edge);
  OsSurface s;
  vec3 base = mix(uLight, uDark, pent);
  s.color = mix(base, mix(uDark, uLight, 0.2), seam * 0.85);
  s.rough = mix(0.36, 0.85, seam);
  s.metal = 0.0;
  s.height = 0.018 * (smoothstep(0.0, 0.13, edge) - 1.0);
  return s;
}

OsSurface osPlain() {
  OsSurface s;
  s.color = uAccent;
  s.rough = 0.3;
  s.metal = 0.0;
  s.height = 0.0;
  return s;
}

OsSurface osLook(float id, vec3 p) {
  if (id < 0.5) return osSteel(p);
  if (id < 1.5) return osPanels(p);
  return osPlain();
}

// Bump mapping from a procedural height (same method as three's perturbNormalArb).
vec3 osPerturb(vec3 pos, vec3 nrm, float h) {
  vec3 sx = dFdx(pos);
  vec3 sy = dFdy(pos);
  vec3 r1 = cross(sy, nrm);
  vec3 r2 = cross(nrm, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * nrm - grad);
}
`;

const FRAG_SURFACE = /* glsl */ `
vec3 osP = normalize(vOsPos);
float osFront = mix(-1.4, 1.4, uProgress);
float osAxis = dot(normalize(vNormal), vec3(0.894, 0.447, 0.0));
float osMix = 1.0 - smoothstep(osFront - 0.06, osFront + 0.06, osAxis);
OsSurface osA = osLook(uFrom, osP);
OsSurface osB = osLook(uTo, osP);
diffuseColor.rgb = mix(osA.color, osB.color, osMix);
float osRough = mix(osA.rough, osB.rough, osMix);
float osMetal = mix(osA.metal, osB.metal, osMix);
float osHeight = mix(osA.height, osB.height, osMix);
float osBand = (osAxis - osFront) / 0.09;
float osGlow = exp(-osBand * osBand) * step(0.0001, uProgress) * 3.0;
`;

function inject(src: string, chunk: string, code: string): string {
  const tag = `#include <${chunk}>`;
  if (!src.includes(tag)) throw new Error(`three shader chunk missing: ${chunk}`);
  return src.replace(tag, `${tag}\n${code}`);
}

function readColor(style: CSSStyleDeclaration, name: string, target: Color): void {
  const value = style.getPropertyValue(name).trim();
  if (/^#[0-9a-f]{3,8}$/i.test(value) || /^rgb/i.test(value)) target.setStyle(value);
}

/** A small procedural studio reflected by the steel (lit panels in a dark room). */
function buildStudio(stage: Color, light: Color) {
  const scene = new Scene();
  const disposables: { dispose(): void }[] = [];
  const add = (w: number, h: number, pos: [number, number, number], color: Color) => {
    const geometry = new PlaneGeometry(w, h);
    const material = new MeshBasicMaterial({ color, side: DoubleSide });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
    disposables.push(geometry, material);
    return material;
  };
  const roomGeometry = new BoxGeometry(14, 14, 14);
  const roomMaterial = new MeshBasicMaterial({ color: stage.clone().multiplyScalar(2.5), side: BackSide });
  scene.add(new Mesh(roomGeometry, roomMaterial));
  disposables.push(roomGeometry, roomMaterial);
  add(5, 3, [-4, 4, 4], light.clone().multiplyScalar(5));
  add(7, 7, [0, 6.5, 0], light.clone().multiplyScalar(1.4));
  add(3, 5, [5.5, 0.5, 3], light.clone().multiplyScalar(1.6));
  add(14, 14, [0, -6.5, 0], light.clone().multiplyScalar(0.12));
  const rimA = add(9, 0.9, [0, -2.2, -5.5], new Color());
  const rimB = add(0.9, 7, [5.8, 0, -3], new Color());
  return {
    scene,
    setAccent(accent: Color) {
      rimA.color.copy(accent).multiplyScalar(3.5);
      rimB.color.copy(accent).multiplyScalar(2.2);
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}

export function mountSportBall(host: HTMLElement, options: BallOptions): BallHandle | null {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-ball-canvas", "");
  canvas.setAttribute("aria-hidden", "true");

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
      // Software rendering (no GPU) = weak device: keep the static ball.
      failIfMajorPerformanceCaveat: true,
    });
  } catch {
    return null;
  }
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(canvas);

  // Colors from the design tokens.
  const stage = new Color();
  const light = new Color(1, 1, 1);
  const accent = new Color(1, 1, 1);
  const readColors = () => {
    const style = getComputedStyle(options.colorSource);
    readColor(style, "--os-stage", stage);
    readColor(style, "--os-on-stage", light);
    readColor(style, "--os-accent", accent);
  };
  readColors();

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 50);
  // Same apparent radius as the static SVG ball (BALL_RADIUS of the half box).
  camera.position.set(0, 0, 1 / Math.sin(Math.atan(BALL_RADIUS * Math.tan(((FOV / 2) * Math.PI) / 180))));

  const studio = buildStudio(stage, light);
  studio.setAccent(accent);
  const pmrem = new PMREMGenerator(renderer);
  let envTarget: WebGLRenderTarget = pmrem.fromScene(studio.scene, 0.035);
  scene.environment = envTarget.texture;

  const key = new DirectionalLight(light, 1.4);
  key.position.set(-3, 4, 5);
  const rim = new DirectionalLight(accent, 2.2);
  rim.position.set(4, 1.5, -4);
  scene.add(key, rim);

  const uniforms = {
    uFrom: { value: options.look },
    uTo: { value: options.look },
    uProgress: { value: 0 },
    uLight: { value: light },
    uDark: { value: stage },
    uAccent: { value: accent },
    uPent: { value: PENTAGON_CENTERS.map((v) => new Vector3(...v)) },
    uHex: { value: HEXAGON_CENTERS.map((v) => new Vector3(...v)) },
  };
  const material = new MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.2 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = inject(
      inject(shader.vertexShader, "common", "varying vec3 vOsPos;"),
      "begin_vertex",
      "vOsPos = position;",
    );
    let fs = inject(shader.fragmentShader, "common", FRAG_PARS);
    fs = inject(fs, "color_fragment", FRAG_SURFACE);
    fs = inject(fs, "roughnessmap_fragment", "roughnessFactor = osRough;");
    fs = inject(fs, "metalnessmap_fragment", "metalnessFactor = osMetal;");
    fs = inject(fs, "normal_fragment_maps", "normal = osPerturb(-vViewPosition, normal, osHeight);");
    fs = inject(fs, "emissivemap_fragment", "totalEmissiveRadiance += uAccent * osGlow;");
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => "os-sport-ball-v1";

  const geometry = new SphereGeometry(1, 128, 96);
  const ball = new Mesh(geometry, material);
  ball.rotation.set(...BALL_TILT);
  scene.add(ball);

  // Motion state.
  const spin = AUTO_SPIN.clone();
  const turn = new Quaternion();
  const axis = new Vector3();
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let morphStart = -1;
  let last = performance.now();
  let ready = false;

  const rotateBy = (v: Vector3, dt: number) => {
    const angle = v.length() * dt;
    if (angle < 1e-6) return;
    axis.copy(v).normalize();
    turn.setFromAxisAngle(axis, angle);
    ball.quaternion.premultiply(turn);
  };

  const frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!dragging) {
      spin.lerp(AUTO_SPIN, 1 - Math.exp(-dt * 1.4));
      rotateBy(spin, dt);
    }
    let scale = 1;
    if (morphStart >= 0) {
      const p = Math.min(1, (now - morphStart) / MORPH_MS);
      uniforms.uProgress.value = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      scale = 1 + 0.06 * Math.sin(Math.PI * p);
      if (p >= 1) {
        uniforms.uFrom.value = uniforms.uTo.value;
        uniforms.uProgress.value = 0;
        morphStart = -1;
      }
    }
    ball.scale.setScalar(scale);
    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      canvas.setAttribute("data-ready", "");
      options.onReady();
    }
  };

  // Pause when off-screen or when the tab is hidden.
  let onScreen = true;
  let running = false;
  const updateLoop = () => {
    const run = onScreen && document.visibilityState === "visible";
    if (run === running) return;
    running = run;
    last = performance.now();
    renderer.setAnimationLoop(run ? frame : null);
  };
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    updateLoop();
  });
  io.observe(host);
  document.addEventListener("visibilitychange", updateLoop);

  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!running) renderer.render(scene, camera);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  updateLoop();

  // Drag to spin, with inertia.
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = performance.now();
    spin.set(0, 0, 0);
    canvas.setPointerCapture?.(e.pointerId);
    canvas.setAttribute("data-dragging", "");
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(0.008, (now - lastT) / 1000);
    const k = Math.PI / Math.max(120, host.clientWidth);
    const v = new Vector3((e.clientY - lastY) * k, (e.clientX - lastX) * k, 0).divideScalar(dt);
    rotateBy(v, dt);
    spin.lerp(v, 0.5);
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
  };
  const onUp = () => {
    dragging = false;
    canvas.removeAttribute("data-dragging");
    if (spin.length() > 14) spin.setLength(14);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  const onContextLost = (e: Event) => {
    e.preventDefault();
    options.onLost();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  let disposed = false;
  return {
    setLook(look: number) {
      if (disposed) return;
      readColors();
      key.color.copy(light);
      rim.color.copy(accent);
      studio.setAccent(accent);
      const previous = envTarget;
      envTarget = pmrem.fromScene(studio.scene, 0.035);
      scene.environment = envTarget.texture;
      previous.dispose();
      if (look === uniforms.uTo.value) return;
      // A morph still running ends where it was going; the new one starts from there.
      uniforms.uFrom.value = uniforms.uTo.value;
      uniforms.uTo.value = look;
      uniforms.uProgress.value = 0;
      morphStart = performance.now();
      spin.y += SPIN_BOOST;
      if (!running) renderer.render(scene, camera);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", updateLoop);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      geometry.dispose();
      material.dispose();
      envTarget.dispose();
      pmrem.dispose();
      studio.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
