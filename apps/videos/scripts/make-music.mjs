// Original ambient electro soundtrack for the OrgaSport videos, composed by code
// (100 BPM: pads + arpeggio + soft pulse). Royalty-free: written for this project.
// Plain Node, no dependency: renders a WAV, then ffmpeg converts it to MP3.
// Usage: node scripts/make-music.mjs [decouverte|tutoriel]
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const SR = 44100;
const BEAT = 60 / 100;
const BAR = BEAT * 4;

// Chords (MIDI notes): Dmaj9 – Bm11 – Gmaj7#11 – Asus2, two bars each.
const CHORDS = [
  { bass: 38, notes: [57, 61, 64, 66, 69] },
  { bass: 35, notes: [54, 57, 61, 64, 66] },
  { bass: 31, notes: [54, 57, 59, 61, 66] },
  { bass: 33, notes: [52, 57, 59, 61, 64] },
];
const CHORD_LEN = BAR * 2;
const ARP = [0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 4, 3, 1];

/** Piecewise-linear automation: [[time, value], …]. */
const curve = (points) => (t) => {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i];
    const [t0, v0] = points[i - 1];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-6, t1 - t0);
  }
  return points[points.length - 1][1];
};

const TRACKS = {
  decouverte: {
    duration: 75,
    pad: curve([[0, 0], [1.5, 1], [72, 1], [75, 0]]),
    arp: curve([[0, 0], [5.5, 0], [7, 0.9], [40, 0.9], [40.6, 0.3], [46.5, 0.3], [47.2, 1], [64, 1], [68, 0.5], [74, 0]]),
    pulse: curve([[0, 0], [13.6, 0], [14, 1], [40, 1], [40.3, 0], [46.8, 0], [47, 1], [65, 1], [65.6, 0]]),
    bright: curve([[0, 0.1], [6, 0.5], [14, 0.8], [40, 0.8], [40.5, 0.12], [46.8, 0.2], [47, 0.9], [65, 0.7], [75, 0.2]]),
    booms: [2.4],
  },
  tutoriel: {
    duration: 150,
    pad: curve([[0, 0], [2, 1], [147, 1], [150, 0]]),
    arp: curve([[0, 0], [7, 0], [9, 0.55], [130, 0.55], [135, 0.9], [146, 0.4], [150, 0]]),
    pulse: curve([[0, 0], [21.5, 0], [22, 0.55], [133, 0.55], [135, 0.9], [144, 0.9], [146, 0]]),
    bright: curve([[0, 0.15], [8, 0.45], [22, 0.55], [135, 0.8], [150, 0.2]]),
    booms: [0.2, 135],
  },
};

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Deterministic noise (same file at every run).
let seed = 12345;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};

function render(key) {
  const tr = TRACKS[key];
  const N = Math.ceil(tr.duration * SR);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const sendL = new Float32Array(N);
  const sendR = new Float32Array(N);
  const chordAt = (t) => CHORDS[Math.floor(t / CHORD_LEN) % CHORDS.length];

  // Sidechain-like ducking from the pulse.
  const duck = (t) => {
    const p = tr.pulse(t);
    if (p <= 0) return 1;
    const inBeat = t % BEAT;
    return 1 - 0.32 * p * Math.exp(-inBeat / 0.16);
  };

  // 1. Pads: 3 detuned saws per note, two-pole low-pass, slow crossfades.
  const segments = Math.ceil(tr.duration / CHORD_LEN) + 1;
  for (let s = 0; s < segments; s++) {
    const chord = CHORDS[s % CHORDS.length];
    const t0 = s * CHORD_LEN - 0.4;
    const t1 = t0 + CHORD_LEN + 2.2;
    const i0 = Math.max(0, Math.floor(t0 * SR));
    const i1 = Math.min(N, Math.floor(t1 * SR));
    chord.notes.forEach((note, n) => {
      const pan = -0.6 + (1.2 * n) / (chord.notes.length - 1);
      const gl = Math.sqrt((1 - pan) / 2);
      const gr = Math.sqrt((1 + pan) / 2);
      const phases = [0, 0.33, 0.66];
      const det = [-0.07, 0, 0.07].map((c) => hz(note) * Math.pow(2, c / 12));
      let y1 = 0;
      let y2 = 0;
      for (let i = i0; i < i1; i++) {
        const t = i / SR;
        let x = 0;
        for (let k = 0; k < 3; k++) {
          phases[k] += det[k] / SR;
          if (phases[k] >= 1) phases[k] -= 1;
          x += phases[k] * 2 - 1;
        }
        x /= 3;
        const lfo = 0.5 + 0.5 * Math.sin(t * 0.37 + n);
        const fc = 380 + 1500 * tr.bright(t) + 260 * lfo;
        const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
        y1 += a * (x - y1);
        y2 += a * (y1 - y2);
        const local = t - t0;
        const env = Math.min(1, local / 1.4) * Math.min(1, Math.max(0, (t1 - t) / 2.0));
        const v = y2 * env * 0.11 * tr.pad(t) * duck(t);
        L[i] += v * gl;
        R[i] += v * gr;
        sendL[i] += v * gl * 0.55;
        sendR[i] += v * gr * 0.55;
      }
    });
  }

  // 2. Arpeggio: 16th notes on the chord tones, plucked sine/triangle, ping-pong delay.
  const step = BEAT / 4;
  const arpL = new Float32Array(N);
  const arpR = new Float32Array(N);
  for (let k = 0; k * step < tr.duration; k++) {
    const t0 = k * step;
    const lvl = tr.arp(t0);
    if (lvl <= 0.001) continue;
    const chord = chordAt(t0);
    const idx = ARP[k % ARP.length];
    const tones = [...chord.notes, ...chord.notes.map((m) => m + 12)];
    const note = tones[idx % tones.length] + 12;
    const f = hz(note);
    const accent = k % 4 === 0 ? 1 : 0.72;
    const len = Math.floor(0.9 * SR);
    const i0 = Math.floor(t0 * SR);
    const pan = Math.sin(k * 0.9) * 0.35;
    let ph = 0;
    for (let j = 0; j < len && i0 + j < N; j++) {
      const t = j / SR;
      ph += f / SR;
      const tri = 1 - 4 * Math.abs((ph % 1) - 0.5);
      const bright = tr.bright(t0);
      const v =
        (Math.sin(2 * Math.PI * ph) * 0.7 + tri * 0.3 * bright) *
        Math.min(1, t / 0.004) *
        Math.exp(-t / (0.12 + 0.12 * bright)) *
        0.085 *
        lvl *
        accent;
      arpL[i0 + j] += v * (1 - pan);
      arpR[i0 + j] += v * (1 + pan);
    }
  }
  const dly = Math.floor(BEAT * 0.75 * SR);
  for (let i = dly; i < N; i++) {
    // Ping-pong: left echoes go right and vice versa.
    arpL[i] += arpR[i - dly] * 0.38;
    arpR[i] += arpL[i - dly] * 0.38;
  }
  for (let i = 0; i < N; i++) {
    L[i] += arpL[i];
    R[i] += arpR[i];
    sendL[i] += arpL[i] * 0.45;
    sendR[i] += arpR[i] * 0.45;
  }

  // 3. Soft pulse: round kick on each beat, airy hat on the off-beats, sub bass on 8ths.
  for (let b = 0; b * BEAT < tr.duration; b++) {
    const t0 = b * BEAT;
    const lvl = tr.pulse(t0 + 0.01);
    if (lvl <= 0.001) continue;
    const i0 = Math.floor(t0 * SR);
    let ph = 0;
    for (let j = 0; j < 0.5 * SR && i0 + j < N; j++) {
      const t = j / SR;
      const f = 46 + 70 * Math.exp(-t / 0.04);
      ph += f / SR;
      const v = Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.13) * 0.42 * lvl;
      L[i0 + j] += v;
      R[i0 + j] += v;
    }
    const h0 = Math.floor((t0 + BEAT / 2) * SR);
    let prev = 0;
    for (let j = 0; j < 0.08 * SR && h0 + j < N; j++) {
      const x = noise();
      const hp = x - prev;
      prev = x;
      const v = hp * Math.exp(-(j / SR) / 0.025) * 0.035 * lvl;
      L[h0 + j] += v * 0.8;
      R[h0 + j] += v;
    }
    const chord = chordAt(t0);
    for (let e = 0; e < 2; e++) {
      const s0 = Math.floor((t0 + (e * BEAT) / 2) * SR);
      const f = hz(chord.bass + 12);
      let p = 0;
      for (let j = 0; j < 0.3 * SR && s0 + j < N; j++) {
        const t = j / SR;
        p += f / SR;
        const raw = Math.sin(2 * Math.PI * p);
        const v = Math.tanh(raw * 1.6) * Math.min(1, t / 0.01) * Math.exp(-t / 0.16) * 0.13 * lvl;
        L[s0 + j] += v;
        R[s0 + j] += v;
      }
    }
  }

  // 4. Impacts (the ball hitting the floor): reverse swell + deep boom + shimmer.
  for (const tb of tr.booms) {
    const ib = Math.floor(tb * SR);
    const pre = Math.floor(1.1 * SR);
    let lp = 0;
    for (let j = -pre; j < 0; j++) {
      if (ib + j < 0) continue;
      const k = (j + pre) / pre;
      lp += 0.05 * (noise() - lp);
      const v = lp * k * k * 0.5;
      L[ib + j] += v;
      R[ib + j] += v;
      sendL[ib + j] += v;
      sendR[ib + j] += v;
    }
    let ph = 0;
    for (let j = 0; j < 2.4 * SR && ib + j < N; j++) {
      const t = j / SR;
      ph += (32 + 40 * Math.exp(-t / 0.08)) / SR;
      const v = Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.7) * 0.55;
      const sh = Math.sin(2 * Math.PI * hz(86) * t) * Math.exp(-t / 0.9) * 0.03;
      L[ib + j] += v + sh;
      R[ib + j] += v + sh * 0.7;
      sendL[ib + j] += sh * 2;
      sendR[ib + j] += sh * 2;
    }
  }

  // 5. Reverb (Freeverb-like: 4 combs + 2 all-passes per side).
  const reverb = (input, offset) => {
    const out = new Float32Array(N);
    for (const d of [1116, 1188, 1277, 1356]) {
      const len = d + offset;
      const buf = new Float32Array(len);
      let pos = 0;
      let filt = 0;
      for (let i = 0; i < N; i++) {
        const y = buf[pos];
        filt = y * 0.75 + filt * 0.25;
        buf[pos] = input[i] + filt * 0.86;
        out[i] += y * 0.25;
        pos = (pos + 1) % len;
      }
    }
    for (const d of [556, 441]) {
      const len = d + offset;
      const buf = new Float32Array(len);
      let pos = 0;
      for (let i = 0; i < N; i++) {
        const b = buf[pos];
        const y = -out[i] + b;
        buf[pos] = out[i] + b * 0.5;
        out[i] = y;
        pos = (pos + 1) % len;
      }
    }
    return out;
  };
  const wetL = reverb(sendL, 0);
  const wetR = reverb(sendR, 23);

  // 6. Mix, fades, normalize (moderate level: peak at −7 dBFS).
  let peak = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const fade = Math.min(1, t / 0.3) * Math.min(1, (tr.duration - t) / 2.5);
    L[i] = Math.tanh((L[i] + wetL[i] * 0.9) * 1.1) * fade;
    R[i] = Math.tanh((R[i] + wetR[i] * 0.9) * 1.1) * fade;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const gain = 0.45 / peak;
  const pcm = Buffer.alloc(44 + N * 4);
  pcm.write("RIFF", 0);
  pcm.writeUInt32LE(36 + N * 4, 4);
  pcm.write("WAVEfmt ", 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(2, 22);
  pcm.writeUInt32LE(SR, 24);
  pcm.writeUInt32LE(SR * 4, 28);
  pcm.writeUInt16LE(4, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write("data", 36);
  pcm.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain)) * 32767), 44 + i * 4);
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain)) * 32767), 46 + i * 4);
  }
  const cache = join(root, ".cache");
  mkdirSync(cache, { recursive: true });
  mkdirSync(join(root, "public/music"), { recursive: true });
  const wav = join(cache, `${key}.wav`);
  writeFileSync(wav, pcm);
  const mp3 = join(root, "public/music", `${key}.mp3`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "160k", mp3]);
  console.log(`${key}: ${tr.duration} s → public/music/${key}.mp3`);
}

const only = process.argv[2];
for (const key of Object.keys(TRACKS)) if (!only || only === key) render(key);
