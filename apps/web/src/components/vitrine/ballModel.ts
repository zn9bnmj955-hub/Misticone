/**
 * Photorealistic pétanque ball for the landing hero (three.js, loaded lazily),
 * modelled on docs/references/boule-reference.png: smooth, very dark silver
 * steel (no grooves, no striations) with soft reflections of the scene, and a
 * single engraving, « ORGASPORT », hollowed into the metal. The engraving is
 * drawn on a canvas with a built-in stroke font (no external font), turned
 * into a normal map and a relief (cavity) map, and projected on the ball as a
 * decal facing the camera at rest. No other mark, no number.
 *
 * Everything is procedural (seeded, so the pre-rendered fallback image made by
 * scripts/render-hero-balls.mjs is identical to what the browser draws). The
 * ball is lit by a small neutral grey studio environment (PMREM): a dark
 * silver satin sheen, with only a faint blue neon edge. Colors come from the CSS tokens.
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
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
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
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import {
  BALL_FINISH,
  BALL_TILT,
  ENGRAVING_ANGLE,
  ENGRAVING_CAP,
  ENGRAVING_STROKE,
  ENGRAVING_TEXT,
  GLYPHS,
  layoutEngraving,
  type GlyphCommand,
} from "./ballGeometry";

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

/** Soft polish variation of the steel (roughness in G): smudges, no scratches, no grooves. */
function polishMap(w: number) {
  const h = w / 2;
  const rand = rng(0x5eed);
  const broad = valueNoise(w, h, 7, rand);
  const fine = valueNoise(w, h, 24, rand);
  const rough = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const m = broad[i] * 0.75 + fine[i] * 0.25;
    rough[i * 4 + 1] = Math.min(1, BALL_FINISH.roughness + (m - 0.5) * 0.14) * 255;
    rough[i * 4 + 3] = 255;
  }
  return dataTexture(rough, w, h, true, false);
}

/** Pixels per cap height of the engraving canvas. */
const CAP_PX = 96;
const MARGIN = 0.45; // cap heights around the word

function traceGlyph(ctx: CanvasRenderingContext2D, strokes: GlyphCommand[][]) {
  for (const stroke of strokes) {
    ctx.beginPath();
    for (const cmd of stroke) {
      if (cmd[0] === "M") ctx.moveTo(cmd[1], cmd[2]);
      else if (cmd[0] === "L") ctx.lineTo(cmd[1], cmd[2]);
      else if (cmd[0] === "C") ctx.bezierCurveTo(cmd[1], cmd[2], cmd[3], cmd[4], cmd[5], cmd[6]);
      else ctx.ellipse(cmd[1], cmd[2], cmd[3] - ENGRAVING_STROKE / 2, cmd[4] - ENGRAVING_STROKE / 2, 0, cmd[5], cmd[6], cmd[7] === 1);
    }
    ctx.stroke();
  }
}

/** Horizontal then vertical box blur (in place), `passes` times. */
function boxBlur(data: Float32Array, w: number, h: number, r: number, passes: number) {
  const tmp = new Float32Array(data.length);
  const n = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += data[y * w + Math.min(w - 1, Math.max(0, x + k))];
        tmp[y * w + x] = s / n;
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
        data[y * w + x] = s / n;
      }
  }
}

/**
 * The engraving as one decal texture: RGB = tangent-space normal (x east, y
 * north), A = relief (depth of the cavity, 0..1). Rows go from the bottom of
 * the word (v = 0) upwards. Size in radians of arc on the ball.
 */
function engravingDecal(maxAnisotropy: number) {
  const layout = layoutEngraving();
  const units = { w: layout.width + MARGIN * 2, h: 1 + MARGIN * 2 };
  const w = Math.ceil(units.w * CAP_PX), h = Math.ceil(units.h * CAP_PX);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = ENGRAVING_STROKE;
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  [...ENGRAVING_TEXT].forEach((ch, i) => {
    ctx.setTransform(CAP_PX, 0, 0, CAP_PX, (MARGIN + layout.x[i]) * CAP_PX, MARGIN * CAP_PX);
    traceGlyph(ctx, GLYPHS[ch].strokes);
  });
  const pixels = ctx.getImageData(0, 0, w, h).data;
  const relief = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) relief[i] = pixels[i * 4] / 255;
  // Bevelled walls: the cut is a little narrower at the bottom than at the surface.
  boxBlur(relief, w, h, Math.max(1, Math.round(CAP_PX * 0.025)), 2);

  const depth = CAP_PX * 0.05; // px: walls ≈ 45°
  const out = new Uint8Array(w * h * 4);
  const at = (x: number, y: number) => relief[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    const row = h - 1 - y; // texture row 0 = bottom of the canvas
    for (let x = 0; x < w; x++) {
      // Height = -depth × relief. East slope from columns, north slope from rows (canvas y goes down).
      const dEast = (-(at(x + 1, y) - at(x - 1, y)) / 2) * depth;
      const dNorth = (-(at(x, y - 1) - at(x, y + 1)) / 2) * depth;
      const l = Math.hypot(dEast, dNorth, 1);
      const i = (row * w + x) * 4;
      out[i] = ((-dEast / l) * 0.5 + 0.5) * 255;
      out[i + 1] = ((-dNorth / l) * 0.5 + 0.5) * 255;
      out[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      out[i + 3] = at(x, y) * 255;
    }
  }
  const texture = dataTexture(out, w, h, false, false);
  texture.anisotropy = maxAnisotropy;
  return { texture, size: new Vector2(units.w * ENGRAVING_CAP, units.h * ENGRAVING_CAP) };
}

/** Elevation of the ball camera above the floor (see frameBallCamera). */
const CAMERA_ELEVATION = (14 * Math.PI) / 180;

/**
 * Where the engraving sits, in the ball's own space: centre `c` (unit vector),
 * `e` (reading direction) and `n` (top of the letters). It faces the camera
 * when the ball is at rest (REST_SPIN), slightly below and left of centre and
 * rising to the right, like the reference photo.
 */
export function engravingFrame(): { c: Vector3; e: Vector3; n: Vector3 } {
  const toCamera = new Vector3(0, Math.sin(CAMERA_ELEVATION), Math.cos(CAMERA_ELEVATION));
  const right = new Vector3(1, 0, 0);
  const up = new Vector3().crossVectors(toCamera, right).normalize();
  const c = toCamera.clone().addScaledVector(right, -0.03).addScaledVector(up, -0.08).normalize();
  const e = right.clone().multiplyScalar(Math.cos(ENGRAVING_ANGLE)).addScaledVector(up, Math.sin(ENGRAVING_ANGLE));
  e.addScaledVector(c, -e.dot(c)).normalize();
  const n = new Vector3().crossVectors(c, e).normalize();
  const rest = new Quaternion().copy(TILT_Q).multiply(new Quaternion().setFromAxisAngle(AXIS_Y, REST_SPIN)).invert();
  return { c: c.applyQuaternion(rest), e: e.applyQuaternion(rest), n: n.applyQuaternion(rest) };
}

const ENGRAVING_PARS = /* glsl */ `
varying vec3 vOsPos;
varying vec3 vDecE;
varying vec3 vDecN;
uniform sampler2D uDecal;
uniform vec2 uDecSize;
uniform vec3 uDecC;
uniform vec3 uDecE;
uniform vec3 uDecN;
`;

function inject(src: string, chunk: string, code: string): string {
  const tag = `#include <${chunk}>`;
  if (!src.includes(tag)) throw new Error(`three shader chunk missing: ${chunk}`);
  return src.replace(tag, `${tag}\n${code}`);
}

/** The steel of the ball (dark silver, engraved « ORGASPORT »), also used by the videos (apps/videos). */
export function steelMaterial(textureSize: number, maxAnisotropy: number) {
  const roughnessMap = polishMap(Math.max(256, textureSize / 4));
  const decal = engravingDecal(maxAnisotropy);
  const frame = engravingFrame();
  const material = new MeshStandardMaterial({
    // The finish colour is the steel's reflectance (F0), taken as is: a very dark silver mirror.
    color: new Color().setHex(parseInt(BALL_FINISH.color.slice(1), 16), LinearSRGBColorSpace),
    metalness: BALL_FINISH.metalness,
    roughness: 1,
    roughnessMap,
    envMapIntensity: 1.3,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDecal = { value: decal.texture };
    shader.uniforms.uDecSize = { value: decal.size };
    shader.uniforms.uDecC = { value: frame.c };
    shader.uniforms.uDecE = { value: frame.e };
    shader.uniforms.uDecN = { value: frame.n };
    shader.vertexShader = inject(shader.vertexShader, "common", "varying vec3 vOsPos;\nvarying vec3 vDecE;\nvarying vec3 vDecN;\nuniform vec3 uDecE;\nuniform vec3 uDecN;");
    shader.vertexShader = inject(shader.vertexShader, "begin_vertex", "vOsPos = position;\nvDecE = normalMatrix * uDecE;\nvDecN = normalMatrix * uDecN;");
    shader.fragmentShader = inject(shader.fragmentShader, "common", ENGRAVING_PARS);
    shader.fragmentShader = inject(
      shader.fragmentShader,
      "color_fragment",
      /* glsl */ `
      vec3 osP = normalize(vOsPos);
      float osC = dot(osP, uDecC);
      vec2 osUv = vec2(atan(dot(osP, uDecE), osC), atan(dot(osP, uDecN), osC)) / uDecSize + 0.5;
      float osIn = step(0.0, osC) * step(0.0, osUv.x) * step(osUv.x, 1.0) * step(0.0, osUv.y) * step(osUv.y, 1.0);
      vec4 osDec = texture2D(uDecal, clamp(osUv, 0.0, 1.0));
      float osCavity = osDec.a * osIn;
      diffuseColor.rgb *= 1.0 - 0.45 * osCavity;
      `,
    );
    shader.fragmentShader = inject(shader.fragmentShader, "roughnessmap_fragment", "roughnessFactor = mix(roughnessFactor, 0.55, osCavity);");
    shader.fragmentShader = inject(
      shader.fragmentShader,
      "normal_fragment_maps",
      /* glsl */ `
      vec3 osT = normalize(vDecE - normal * dot(vDecE, normal));
      vec3 osB = normalize(vDecN - normal * dot(vDecN, normal));
      vec3 osTn = osDec.xyz * 2.0 - 1.0;
      normal = normalize(mix(normal, osTn.x * osT + osTn.y * osB + osTn.z * normal, osIn));
      `,
    );
  };
  return { material, textures: [roughnessMap, decal.texture] };
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
 * Studio reflected by the ball: a neutral grey room (so the steel stays a
 * neutral dark silver, not night blue), one broad soft key light, a dim fill,
 * a grey horizon band, and two thin blue neon tubes that only leave a faint
 * edge on the rim.
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
  // Neutral grey of the same brightness as a token colour (no blue cast on the steel).
  const grey = (c: Color) => {
    const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    return new Color(l, l, l);
  };
  const roomM = new MeshBasicMaterial({ color: grey(colors.stage.clone().lerp(colors.light, 0.05)), side: BackSide });
  scene.add(new Mesh(roomG, roomM));
  disposables.push(roomG, roomM);

  const white = grey(colors.light);
  add(26, 26, [0, 11, 0], white.clone().multiplyScalar(0.25)); // night sky glow (broad, soft)
  add(12, 8, [-6, 7, 7], white.clone().multiplyScalar(2.4)); // key softbox (broad and dim: a soft sheen)
  add(4, 9, [8.5, 2, 4], white.clone().multiplyScalar(0.9)); // fill strip
  add(6, 2.5, [3, 6, -8], white.clone().multiplyScalar(0.5)); // back top
  // Horizon: a grey band, and blue neon tubes behind the ball (a faint edge on the rim only).
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    add(8, 0.6, [Math.cos(a) * 13, -0.6, Math.sin(a) * 13], white.clone().multiplyScalar(0.55));
  }
  add(0.35, 10, [-9, 1, -7], colors.accent.clone().multiplyScalar(1.2));
  add(0.35, 10, [10, 1, -5], colors.accent.clone().multiplyScalar(0.9));
  add(3, 3, [-3.5, 5, 8], white.clone().multiplyScalar(3)); // floodlight: a soft, not blinding, highlight
  add(2, 9, [-7, 2, -9], white.clone().multiplyScalar(0.7)); // rim, back left
  // Floor: dark ground lit by the neon pitch.
  add(30, 30, [0, -5.2, 0], white.clone().multiplyScalar(0.1), [0, 10, 0]);
  add(14, 14, [0, -5, 0], grey(colors.line).multiplyScalar(0.05), [0, 10, 0]); // pitch glow below
  const pmrem = new PMREMGenerator(renderer);
  const target: WebGLRenderTarget = pmrem.fromScene(scene, 0.015);
  pmrem.dispose();
  disposables.forEach((d) => d.dispose());
  return target;
}

export type BallModel = {
  group: Group;
  /** The ball itself (rotate it). */
  ball: Mesh;
  dispose(): void;
};

/** Builds the ball (radius 1, resting on y = -1) with its contact shadow. */
export function createBall(accent: Color, opts: { textureSize: number; maxAnisotropy: number }): BallModel {
  const group = new Group();
  const geometry = new SphereGeometry(1, 128, 96);
  const steel = steelMaterial(opts.textureSize, opts.maxAnisotropy);

  const ball = new Mesh(geometry, steel.material);
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
    dispose() {
      geometry.dispose();
      steel.material.dispose();
      steel.textures.forEach((t) => t.dispose());
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
  cam.position.set(0, d * Math.sin(CAMERA_ELEVATION) - 0.12, d * Math.cos(CAMERA_ELEVATION));
  cam.lookAt(0, -0.12, 0);
}

// Top tipped away by the camera's elevation: both turning poles sit on the rim, slight roll.
const TILT_Q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), BALL_TILT[2] * 0.7).premultiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.3));
const SPIN_Q = new Quaternion();
const PITCH_Q = new Quaternion();
const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);

/** Orientation of the ball: a slight tilt (engraving facing the camera at rest), a spin around the vertical and a drag pitch. */
export function poseBall(ball: Mesh, spin: number, pitch = 0): void {
  SPIN_Q.setFromAxisAngle(AXIS_Y, spin);
  PITCH_Q.setFromAxisAngle(AXIS_X, pitch);
  ball.quaternion.copy(TILT_Q).multiply(SPIN_Q).premultiply(PITCH_Q);
}

/** Initial spin angle shared by the pre-rendered image and the live scene. */
export const REST_SPIN = BALL_TILT[1];
