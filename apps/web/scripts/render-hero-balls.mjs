// Pre-renders the landing's static balls (public/vitrine/ball.webp, football.webp) from the very
// same three.js code as the live hero (src/components/vitrine/ballModel.ts), with a transparent
// background, so the fallback shown before / instead of the 3D is identical to it.
//
//   node scripts/render-hero-balls.mjs [--preview <dir>]   (from apps/web)
//
// No server needed: the TypeScript modules are transpiled on the fly and served to a headless
// Chromium (Playwright) together with three.js and the design tokens. Output ≤ 40 KB per image.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { chromium } from "@playwright/test";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const threeDir = join(web, "node_modules/three");
const tokens = readFileSync(join(web, "../../packages/ui/src/tokens.css"), "utf8");
const previewIdx = process.argv.indexOf("--preview");
const preview = previewIdx > 0 ? process.argv[previewIdx + 1] : null;

const SIZE = 560; // px; shown at ≤ 20 rem (DPR 1.5–2 stays sharp enough for a still)
const MAX_BYTES = 40 * 1024;
const LOOKS = [
  { file: "ball.webp", look: 0, sport: "petanque" },
  { file: "football.webp", look: 1, sport: "football" },
];

function module(name) {
  const src = readFileSync(join(web, "src/components/vitrine", `${name}.ts`), "utf8");
  return ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from "\.\/(\w+)"/g, 'from "/m/$1.js"');
}

const page = (look, sport) => `<!doctype html><html><head><style>${tokens} html,body{margin:0;background:transparent}</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script></head>
<body><div id="src" data-scheme="stage" data-sport="${sport}"></div><canvas id="c" width="${SIZE}" height="${SIZE}"></canvas>
<script type="module">
import { WebGLRenderer, Scene, PerspectiveCamera, NeutralToneMapping } from "three";
import { createBall, createEnvironment, frameBallCamera, poseBall, readStageColors, REST_SPIN } from "/m/ballModel.js";
const canvas = document.getElementById("c");
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(${SIZE}, ${SIZE}, false);
renderer.toneMapping = NeutralToneMapping;
renderer.setClearColor(0, 0);
const colors = readStageColors(document.getElementById("src"));
const scene = new Scene();
scene.environment = createEnvironment(renderer, colors).texture;
const ball = createBall(${look}, colors.accent, { textureSize: 2048, maxAnisotropy: 8 });
scene.add(ball.group);
poseBall(ball.ball, REST_SPIN);
const cam = new PerspectiveCamera();
frameBallCamera(cam);
renderer.render(scene, cam);
window.__done = true;
</script></body></html>`;

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const { file, look, sport } of LOOKS) {
  const ctx = await browser.newContext({ viewport: { width: SIZE, height: SIZE } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.error(e));
  await p.route("http://render.local/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: page(look, sport) });
    if (path.startsWith("/m/")) return route.fulfill({ contentType: "text/javascript", body: module(path.slice(3, -3)) });
    if (path.startsWith("/three/")) return route.fulfill({ contentType: "text/javascript", body: readFileSync(join(threeDir, path.slice(7))) });
    return route.fulfill({ status: 404 });
  });
  await p.goto("http://render.local/");
  await p.waitForFunction(() => window.__done === true, null, { timeout: 120000 });
  if (preview) {
    mkdirSync(preview, { recursive: true });
    const png = await p.evaluate(() => document.getElementById("c").toDataURL("image/png"));
    writeFileSync(join(preview, file.replace(".webp", ".png")), Buffer.from(png.split(",")[1], "base64"));
  }
  let quality = 0.86, bytes;
  for (;;) {
    const url = await p.evaluate((q) => document.getElementById("c").toDataURL("image/webp", q), quality);
    bytes = Buffer.from(url.split(",")[1], "base64");
    if (bytes.length <= MAX_BYTES || quality < 0.3) break;
    quality -= 0.06;
  }
  mkdirSync(join(web, "public/vitrine"), { recursive: true });
  writeFileSync(join(web, "public/vitrine", file), bytes);
  console.log(`${file}: ${(bytes.length / 1024).toFixed(1)} KB (quality ${quality.toFixed(2)})`);
  await ctx.close();
}
await browser.close();
