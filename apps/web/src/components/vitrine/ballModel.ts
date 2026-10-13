/**
 * Photorealistic sport balls for the landing hero (three.js, loaded lazily).
 *
 * - Pétanque: satin, lathe-turned steel (anisotropic metal), three engraved
 *   striations, micro-scratches and polish variation from generated maps. No
 *   brand, no text, no weight number: the surface is deliberately anonymous.
 * - Football: black pentagons / white hexagons with stitched seams, pebbled
 *   synthetic leather and a light varnish.
 * - Plain: any other sport, a lacquered ball in the accent color.
 *
 * Everything is procedural (seeded, so the pre-rendered fallback image made by
 * scripts/render-hero-balls.mjs is identical to what the browser draws). The
 * balls are lit by a small "neon studio" environment (PMREM) so the steel
 * reflects the blue lines of the scene. Colors come from the CSS tokens.
 */
import {
  CustomBlending,
  OneFactor,
  ZeroFactor,
  BackSide,
  CanvasTexture,
  Color,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NoColorSpace,
  PlaneGeometry,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  RepeatWrapping,
  ClampToEdgeWrapping,
  RGBAFormat,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { BALL_TILT, GROOVE_OFFSETS, HEXAGON_CENTERS, PENTAGON_CENTERS } from "./ballGeometry";

/** Colors of the scene, read from the design tokens of the hero (see readStageColors). */
export type StageColors = { stage: Color; light: Color; line: Color; haze: Color; accent: Color };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise on a W×H grid, horizontally periodic (wraps around the ball). */
function valueNoise(w: number, h: number, cells: number, rand: () => number): Float32Array {
  const cw = cells, ch = Math.max(2, Math.round((cells * h) / w));
  const lattice = new Float32Array(cw * (ch + 1));
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const out = new Float32Array(w * h);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * ch, y0 = Math.floor(fy), ty = smooth(fy - y0);
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * cw, x0 = Math.floor(fx), tx = smooth(fx - x0), x1 = (x0 + 1) % cw;
      const a = lattice[y0 * cw + x0], b = lattice[y0 * cw + x1];
      const c = lattice[(y0 + 1) * cw + x0], d = lattice[(y0 + 1) * cw + x1];
      out[y * w + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

function dataTexture(data: Uint8Array, w: number, h: number, wrap: boolean, color: boolean): DataTexture {
  const t = new DataTexture(data, w, h, RGBAFormat);
  t.wrapS = wrap ? RepeatWrapping : ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

/** Tangent-space normal map from a height field on the sphere (equirectangular, row 0 = south pole). */
function normalsFromHeight(height: Float32Array, w: number, h: number, strength: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const lat = ((y + 0.5) / h - 0.5) * Math.PI;
    const stretch = 1 / Math.max(Math.cos(lat), 0.15);
    const yu = Math.min(h - 1, y + 1), yd = Math.max(0, y - 1);
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w, xr = (x + 1) % w;
      const dx = ((height[y * w + xr] - height[y * w + xl]) / 2) * stretch * strength;
      const dy = ((height[yu * w + x] - height[yd * w + x]) / 2) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      out[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      out[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Steel maps (DataTexture rows go from v = 0, the south pole, upwards):
 * colour (cavities darker), roughness (G) and normals (grooves + scratches).
 */
function steelMaps(w: number) {
  const h = w / 2;
  const rand = rng(0x5eed);
  const height = new Float32Array(w * h);
  const scratch = new Float32Array(w * h);
  const groove = new Float32Array(w * h);

  // Engraved striations: parallel circles around the ball (constant latitude).
  const grooveHalf = Math.max(1.2, h / 300); // ≈ 0.7 mm wide on a 72 mm ball
  for (const offset of GROOVE_OFFSETS) {
    const row = (Math.asin(offset) / Math.PI + 0.5) * h;
    for (let y = Math.floor(row - grooveHalf * 2); y <= Math.ceil(row + grooveHalf * 2); y++) {
      if (y < 0 || y >= h) continue;
      const d = Math.abs(y + 0.5 - row) / grooveHalf;
      const g = d < 1 ? Math.cos((d * Math.PI) / 2) : 0;
      const shoulder = d < 2 ? Math.max(0, 1 - Math.abs(d - 1.15) / 0.35) * 0.12 : 0;
      for (let x = 0; x < w; x++) {
        height[y * w + x] += -g * 2.4 + shoulder;
        groove[y * w + x] = Math.max(groove[y * w + x], g);
      }
    }
  }

  // Fine lathe marks: very shallow concentric rings (the satin "turned" finish).
  for (let y = 0; y < h; y++) {
    const lat = Math.abs((y + 0.5) / h - 0.5) * 2;
    const ring = (Math.sin(y * 2.7) * 0.025 + Math.sin(y * 0.93 + 1.3) * 0.02) * (1 - Math.max(0, lat - 0.7) / 0.3);
    for (let x = 0; x < w; x++) height[y * w + x] += ring;
  }

  // Micro-scratches from play: short random strokes, wrapped around the seam.
  const strokes = Math.round(w * 1.7);
  for (let s = 0; s < strokes; s++) {
    let x = rand() * w, y = h * (0.08 + rand() * 0.84);
    const angle = rand() * Math.PI * 2;
    const len = 4 + rand() ** 2 * w * 0.05;
    const depth = 0.08 + rand() * 0.25;
    const sx = Math.cos(angle) / Math.max(Math.cos(((y / h) - 0.5) * Math.PI), 0.2), sy = Math.sin(angle);
    for (let t = 0; t < len; t++) {
      const xi = ((Math.round(x) % w) + w) % w, yi = Math.round(y);
      if (yi < 0 || yi >= h) break;
      const fade = Math.sin((t / len) * Math.PI);
      height[yi * w + xi] -= depth * fade;
      scratch[yi * w + xi] = Math.min(1, scratch[yi * w + xi] + depth * fade * 2);
      x += sx;
      y += sy;
    }
  }
  // A few deeper dents (the ball has been played with).
  for (let s = 0; s < 14; s++) {
    const cx = rand() * w, cy = h * (0.15 + rand() * 0.7), r = 2 + rand() * 4;
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r * 1.5); x <= cx + r * 1.5; x++) {
        if (y < 0 || y >= h) continue;
        const d = Math.hypot((x - cx) / 1.5, y - cy) / r;
        if (d < 1) height[y * w + ((x % w) + w) % w] -= (1 - d * d) * 0.6;
      }
  }

  const mottle = valueNoise(w, h, 9, rand);
  const fine = valueNoise(w, h, 64, rand);
  const color = new Uint8Array(w * h * 4);
  const rough = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const m = mottle[i] * 0.7 + fine[i] * 0.3;
    // Steel F0 ≈ 0.56 linear (sRGB ≈ 196), slightly blue-grey; cavities darker.
    const tone = (1 - groove[i] * 0.55) * (0.93 + m * 0.07) * (1 - scratch[i] * 0.06);
    color[i * 4] = 190 * tone;
    color[i * 4 + 1] = 195 * tone;
    color[i * 4 + 2] = 203 * tone;
    color[i * 4 + 3] = 255;
    const r = 0.15 + m * 0.12 + scratch[i] * 0.16 + groove[i] * 0.3;
    rough[i * 4] = 0;
    rough[i * 4 + 1] = Math.min(1, r) * 255;
    rough[i * 4 + 2] = 0;
    rough[i * 4 + 3] = 255;
  }
  return {
    map: dataTexture(color, w, h, true, true),
    roughnessMap: dataTexture(rough, w, h, true, false),
    normalMap: dataTexture(normalsFromHeight(height, w, h, 1.6), w, h, true, false),
  };
}

/** Pebbled synthetic leather (tiled normal map). */
function leatherNormal(size: number) {
  const rand = rng(0x1ea7);
  const a = valueNoise(size, size, 48, rand);
  const b = valueNoise(size, size, 112, rand);
  const height = new Float32Array(size * size);
  for (let i = 0; i < height.length; i++) height[i] = Math.abs(a[i] - 0.5) * 1.2 + b[i] * 0.6;
  // Square texture tiled on the sphere: no latitude correction needed for a fine grain.
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (height[y * size + ((x + 1) % size)] - height[y * size + ((x - 1 + size) % size)]) * 2;
      const dy = (height[((y + 1) % size) * size + x] - height[((y - 1 + size) % size) * size + x]) * 2;
      const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
      out[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      out[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      out[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  const t = dataTexture(out, size, size, true, false);
  t.wrapT = RepeatWrapping;
  t.repeat.set(10, 5);
  return t;
}

const PANEL_PARS = /* glsl */ `
varying vec3 vOsPos;
uniform vec3 uPent[12];
uniform vec3 uHex[20];
uniform vec3 uWhite;
uniform vec3 uBlack;
float osPanelEdge(vec3 p, out float pent) {
  float bp = -2.0;
  for (int i = 0; i < 12; i++) bp = max(bp, dot(p, uPent[i]));
  float h1 = -2.0;
  float h2 = -2.0;
  for (int i = 0; i < 20; i++) {
    float d = dot(p, uHex[i]);
    if (d > h1) { h2 = h1; h1 = d; } else if (d > h2) { h2 = d; }
  }
  float aP = acos(clamp(bp, -1.0, 1.0)) + 0.0387;
  float aH1 = acos(clamp(h1, -1.0, 1.0)) - 0.0387;
  float aH2 = acos(clamp(h2, -1.0, 1.0)) - 0.0387;
  pent = step(aP, aH1);
  return pent > 0.5 ? aH1 - aP : min(aH2 - aH1, aP - aH1);
}
vec3 osBump(vec3 pos, vec3 nrm, float h) {
  vec3 sx = dFdx(pos);
  vec3 sy = dFdy(pos);
  vec3 r1 = cross(sy, nrm);
  vec3 r2 = cross(nrm, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * nrm - grad);
}
`;

function inject(src: string, chunk: string, code: string, before = false): string {
  const tag = `#include <${chunk}>`;
  if (!src.includes(tag)) throw new Error(`three shader chunk missing: ${chunk}`);
  return src.replace(tag, before ? `${code}\n${tag}` : `${tag}\n${code}`);
}

function footballMaterial(leather: Texture) {
  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.32,
    normalMap: leather,
    normalScale: new Vector2(0.22, 0.22),
    sheen: 0.15,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPent = { value: PENTAGON_CENTERS.map((v) => new Vector3(...v)) };
    shader.uniforms.uHex = { value: HEXAGON_CENTERS.map((v) => new Vector3(...v)) };
    shader.uniforms.uWhite = { value: new Color(0.86, 0.87, 0.88) };
    shader.uniforms.uBlack = { value: new Color(0.012, 0.013, 0.016) };
    shader.vertexShader = inject(shader.vertexShader, "common", "varying vec3 vOsPos;");
    shader.vertexShader = inject(shader.vertexShader, "begin_vertex", "vOsPos = position;");
    shader.fragmentShader = inject(shader.fragmentShader, "common", PANEL_PARS);
    shader.fragmentShader = inject(
      shader.fragmentShader,
      "color_fragment",
      /* glsl */ `
      vec3 osP = normalize(vOsPos);
      float osPent;
      float osEdge = osPanelEdge(osP, osPent);
      float osSeam = 1.0 - smoothstep(0.004, 0.02, osEdge);
      diffuseColor.rgb = mix(uWhite, uBlack, osPent) * mix(1.0, 0.35, osSeam);
      `,
    );
    shader.fragmentShader = inject(
      shader.fragmentShader,
      "roughnessmap_fragment",
      "roughnessFactor = mix(roughnessFactor, 0.85, osSeam);",
    );
    // Panels are slightly cushioned: they dip into the seams.
    shader.fragmentShader = inject(
      shader.fragmentShader,
      "normal_fragment_maps",
      "normal = osBump(-vViewPosition, normal, 0.022 * (smoothstep(0.0, 0.11, osEdge) - 1.0));",
    );
  };
  return material;
}

/** Soft contact shadow + a faint blue bounce from the floor, drawn under the ball. */
function radialTexture(stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Neon studio reflected by the balls: a dark room, one big softbox (the key
 * highlight), a cool fill, a blue horizon band and blue tubes, and a glowing
 * floor grid underneath.
 */
export function createEnvironment(renderer: WebGLRenderer, colors: StageColors) {
  const scene = new Scene();
  const disposables: { dispose(): void }[] = [];
  const add = (w: number, h: number, pos: [number, number, number], color: Color, look: [number, number, number] = [0, 0, 0]) => {
    const g = new PlaneGeometry(w, h);
    const m = new MeshBasicMaterial({ color, side: DoubleSide });
    const mesh = new Mesh(g, m);
    mesh.position.set(...pos);
    mesh.lookAt(...look);
    scene.add(mesh);
    disposables.push(g, m);
  };
  const roomG = new SphereGeometry(20, 32, 16);
  const roomM = new MeshBasicMaterial({ color: colors.stage.clone().lerp(colors.light, 0.05), side: BackSide });
  scene.add(new Mesh(roomG, roomM));
  disposables.push(roomG, roomM);

  const white = colors.light;
  add(26, 26, [0, 11, 0], white.clone().multiplyScalar(0.1)); // night sky glow (broad, soft)
  add(10, 6, [-6, 7, 7], white.clone().multiplyScalar(6)); // key softbox
  add(4, 9, [8.5, 2, 4], white.clone().multiplyScalar(3.2)); // fill strip
  add(6, 2.5, [3, 6, -8], white.clone().multiplyScalar(1.2)); // back top
  // Horizon: a pale band with the stadium glow, and blue neon tubes.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    add(8, 0.6, [Math.cos(a) * 13, -0.6, Math.sin(a) * 13], white.clone().lerp(colors.line, 0.22).multiplyScalar(1.3));
  }
  add(0.35, 10, [-9, 1, -7], colors.accent.clone().multiplyScalar(2.6));
  add(0.35, 10, [10, 1, -5], colors.accent.clone().multiplyScalar(2));
  add(1.4, 1.4, [-3.5, 5, 8], white.clone().multiplyScalar(16)); // floodlight: the crisp highlight
  add(2, 9, [-7, 2, -9], white.clone().lerp(colors.accent, 0.5).multiplyScalar(2.2)); // rim, back left
  // Floor: dark ground lit by the neon pitch.
  add(30, 30, [0, -5.2, 0], white.clone().multiplyScalar(0.1), [0, 10, 0]);
  add(14, 14, [0, -5, 0], colors.line.clone().multiplyScalar(0.05), [0, 10, 0]); // neon pitch glow below
  const pmrem = new PMREMGenerator(renderer);
  const target: WebGLRenderTarget = pmrem.fromScene(scene, 0.015);
  pmrem.dispose();
  disposables.forEach((d) => d.dispose());
  return target;
}

export type BallLookIndex = number; // LOOK_INDEX of ballGeometry: 0 steel, 1 panels, 2 plain

export type BallModel = {
  group: Group;
  /** The ball itself (rotate it). */
  ball: Mesh;
  setLook(look: BallLookIndex, accent: Color): void;
  dispose(): void;
};

/** Builds the ball (radius 1, resting on y = -1) with its contact shadow. */
export function createBall(look: BallLookIndex, accent: Color, opts: { textureSize: number; maxAnisotropy: number }): BallModel {
  const group = new Group();
  const geometry = new SphereGeometry(1, 160, 112);
  const maps = steelMaps(opts.textureSize);
  for (const t of Object.values(maps)) t.anisotropy = opts.maxAnisotropy;
  const steel = new MeshPhysicalMaterial({
    ...maps,
    metalness: 1,
    roughness: 1,
    normalScale: new Vector2(0.9, 0.9),
    anisotropy: 0.3,
    anisotropyRotation: 0,
    envMapIntensity: 1.6,
  });
  const leather = leatherNormal(256);
  const football = footballMaterial(leather);
  const plain = new MeshPhysicalMaterial({ color: accent, roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12 });
  const materials = [steel, football, plain];

  const ball = new Mesh(geometry, materials[look] ?? plain);
  group.add(ball);

  const shadowTex = radialTexture([
    [0, "rgba(0,0,0,0.92)"],
    [0.35, "rgba(0,0,0,0.55)"],
    [1, "rgba(0,0,0,0)"],
  ]);
  const shadowG = new PlaneGeometry(2.5, 2.5);
  const shadowM = new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadow = new Mesh(shadowG, shadowM);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.999;
  shadow.scale.set(1, 0.9, 1);
  group.add(shadow);

  const bounceTex = radialTexture([
    [0, "rgb(190,190,190)"],
    [0.5, "rgb(45,45,45)"],
    [1, "rgb(0,0,0)"],
  ]);
  const bounceG = new PlaneGeometry(3, 3);
  const bounceM = new MeshBasicMaterial({ map: bounceTex, transparent: true, depthWrite: false, blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor, color: accent });
  const bounce = new Mesh(bounceG, bounceM);
  bounce.rotation.x = -Math.PI / 2;
  bounce.position.y = -1.002;
  bounce.renderOrder = -1;
  group.add(bounce);

  return {
    group,
    ball,
    setLook(next, color) {
      ball.material = materials[next] ?? plain;
      plain.color.copy(color);
      bounceM.color.copy(color);
    },
    dispose() {
      geometry.dispose();
      materials.forEach((m) => m.dispose());
      Object.values(maps).forEach((t) => t.dispose());
      leather.dispose();
      [shadowTex, shadowG, shadowM, bounceTex, bounceG, bounceM].forEach((d) => d.dispose());
    },
  };
}

/** Reads the scene colours from the CSS tokens of an element (fallbacks keep the scene sane). */
export function readStageColors(el: Element, target?: StageColors): StageColors {
  const style = getComputedStyle(el);
  const out = target ?? { stage: new Color(), light: new Color(), line: new Color(), haze: new Color(), accent: new Color() };
  const read = (name: string, c: Color) => {
    const v = style.getPropertyValue(name).trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v) || /^rgb/i.test(v)) c.setStyle(v);
  };
  read("--os-stage", out.stage);
  read("--os-on-stage", out.light);
  read("--os-stage-line", out.line);
  read("--os-stage-haze", out.haze);
  read("--os-accent", out.accent);
  return out;
}

/** Frames the ball in its square viewport: radius = 62 % of the half box, camera 14° above the floor. */
export function frameBallCamera(cam: PerspectiveCamera): void {
  cam.fov = 24;
  cam.aspect = 1;
  cam.updateProjectionMatrix();
  const d = 1 / (0.62 * Math.tan((cam.fov * Math.PI) / 360));
  const elev = (14 * Math.PI) / 180;
  cam.position.set(0, d * Math.sin(elev) - 0.12, d * Math.cos(elev));
  cam.lookAt(0, -0.12, 0);
}

// Top tipped away by the camera's elevation: both turning poles sit on the rim, slight roll.
const TILT_Q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), BALL_TILT[2] * 0.7).premultiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.3));
const SPIN_Q = new Quaternion();
const PITCH_Q = new Quaternion();
const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);

/** Orientation of the ball: a slight tilt (grooves visible), a spin around the vertical and a drag pitch. */
export function poseBall(ball: Mesh, spin: number, pitch = 0): void {
  SPIN_Q.setFromAxisAngle(AXIS_Y, spin);
  PITCH_Q.setFromAxisAngle(AXIS_X, pitch);
  ball.quaternion.copy(TILT_Q).multiply(SPIN_Q).premultiply(PITCH_Q);
}

/** Initial spin angle shared by the pre-rendered image and the live scene. */
export const REST_SPIN = BALL_TILT[1];
