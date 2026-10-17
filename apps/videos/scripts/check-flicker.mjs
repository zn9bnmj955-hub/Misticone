// Frame-by-frame flicker review of a rendered video (task P3: terrains must never blink).
//
// A frame "blinks" when the brightness of the picture jumps one way from the frame
// before and back the other way to the frame after, both by more than THRESHOLD
// (out of 255). That is the signature of the flicker we had: a floor veil
// z-fighting with the mirror, sub-pixel neon lines popping in and out, pulsing
// lights. A camera move or a fade changes the brightness in one direction only and
// is not counted. The same test is also run on a 4 × 4 grid of regions and reported
// (for review only: a counter changing digits or a very fast pan shows there too).
//
// Usage: node scripts/check-flicker.mjs <video.mp4> [more.mp4 …]
// Prints one JSON line per file; exits 1 when any frame of any file blinks.
// Render an extract first, e.g.:
//   npx remotion render <bundle> Decouverte169 out.mp4 --frames=180-419 --crf=12 --gl=swangle --muted
import { execFileSync, spawn } from "node:child_process";

const THRESHOLD = 0.3;
const REGION_THRESHOLD = 1;
const GRID = 4;

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: node scripts/check-flicker.mjs <video.mp4> [more.mp4 …]");
  process.exit(2);
}

/** Mean brightness of the whole picture and of each region of the grid. */
function measure(frame, w, h) {
  const regions = new Float64Array(GRID * GRID);
  const rw = w / GRID;
  const rh = h / GRID;
  let total = 0;
  for (let y = 0; y < h; y++) {
    const row = Math.min(GRID - 1, Math.floor(y / rh)) * GRID;
    for (let x = 0; x < w; x++) {
      const v = frame[y * w + x];
      total += v;
      regions[row + Math.min(GRID - 1, Math.floor(x / rw))] += v;
    }
  }
  for (let i = 0; i < regions.length; i++) regions[i] /= (w * h) / (GRID * GRID);
  return { mean: total / (w * h), regions };
}

const reversal = (a, b, c, t) => {
  const d1 = b - a;
  const d2 = c - b;
  return (d1 > t && d2 < -t) || (d1 < -t && d2 > t);
};

function check(file) {
  const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file])
    .toString()
    .trim()
    .split(",")
    .map(Number);
  const size = w * h;
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
    const m = [];
    let pending = Buffer.alloc(0);
    ff.stdout.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= size) {
        m.push(measure(pending.subarray(0, size), w, h));
        pending = pending.subarray(size);
      }
    });
    ff.on("close", () => {
      const blinking = [];
      let regionBlinks = 0;
      for (let f = 1; f < m.length - 1; f++) {
        if (reversal(m[f - 1].mean, m[f].mean, m[f + 1].mean, THRESHOLD)) blinking.push(f);
        for (let r = 0; r < GRID * GRID; r++)
          if (reversal(m[f - 1].regions[r], m[f].regions[r], m[f + 1].regions[r], REGION_THRESHOLD)) regionBlinks++;
      }
      resolve({ file, frames: m.length, blinkingFrames: blinking.length, firstBlinking: blinking.slice(0, 12), regionBlinks, ok: blinking.length === 0 });
    });
  });
}

let ok = true;
for (const file of files) {
  const r = await check(file);
  console.log(JSON.stringify(r));
  ok &&= r.ok;
}
process.exit(ok ? 0 : 1);
