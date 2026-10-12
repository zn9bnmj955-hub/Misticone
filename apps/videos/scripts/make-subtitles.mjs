// Writes the French WebVTT subtitles of both videos and the voice-over script
// (docs/videos/voix-off.md) from one source: src/data/script.json.
// Usage: node scripts/make-subtitles.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repo = join(root, "..", "..");
const data = JSON.parse(readFileSync(join(root, "src/data/script.json"), "utf8"));
const outDir = join(repo, "apps/web/public/videos");
mkdirSync(outDir, { recursive: true });

const MAX_LINE = 42;

/** Splits a sentence into lines of at most MAX_LINE characters (word boundaries). */
function wrap(text) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > MAX_LINE) {
      lines.push(line);
      line = word;
    } else line = line ? line + " " + word : word;
  }
  if (line) lines.push(line);
  // Never leave a lone punctuation-only line ("?", "!", "»").
  for (let i = lines.length - 1; i > 0; i--) {
    if (lines[i].length <= 2) {
      lines[i - 1] += " " + lines[i];
      lines.splice(i, 1);
    }
  }
  return lines;
}

const stamp = (s) => {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const rest = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(sec)}.${p(rest, 3)}`;
};
const short = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

for (const [key, video] of Object.entries(data)) {
  const cues = [];
  for (const shot of video.shots) {
    const start = shot.start + 0.4;
    const end = shot.end - 0.25;
    const lines = wrap(shot.voice);
    // Two lines per cue at most; longer texts become several cues, timed by length.
    const groups = [];
    for (let i = 0; i < lines.length; i += 2) groups.push(lines.slice(i, i + 2));
    const total = groups.reduce((n, g) => n + g.join(" ").length, 0);
    let t = start;
    for (const g of groups) {
      const d = ((end - start) * g.join(" ").length) / total;
      cues.push({ start: t, end: t + d - (groups.length > 1 ? 0.05 : 0), text: g.join("\n") });
      t += d;
    }
  }
  const vtt =
    "WEBVTT\nKind: subtitles\nLanguage: fr\n\n" +
    cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join("\n");
  writeFileSync(join(outDir, `${key}.vtt`), vtt);
  console.log(`${key}.vtt: ${cues.length} sous-titres`);
}

// Voice-over script, ready to record or to synthesize.
let md = `# Vidéos OrgaSport — texte de la voix off

> Généré par \`apps/videos/scripts/make-subtitles.mjs\` à partir de \`apps/videos/src/data/script.json\` (même source que les
> sous-titres et que le minutage des plans). Pour modifier un texte : changer le JSON, puis \`pnpm --filter @orgasport/videos subtitles\`.

**Consignes d'enregistrement** : voix française naturelle, chaleureuse, débit posé (≈ 150 mots/min pour la découverte,
≈ 130 pour le tutoriel). Chaque phrase commence à l'heure indiquée et doit finir avant le plan suivant. Enregistrer en WAV
48 kHz mono, sans musique (la musique est mixée ensuite, environ −18 dB sous la voix).
La piste « voix » des vidéos est laissée vide : déposer le fichier dans \`apps/videos/public/voice/<video>.wav\` et l'ajouter
dans la composition (\`<Audio>\`), puis relancer le rendu.
`;
for (const [, video] of Object.entries(data)) {
  md += `\n## ${video.title} (${short(video.duration)})\n\n| Début | Fin | Voix off | Texte à l'écran |\n|---|---|---|---|\n`;
  for (const s of video.shots) md += `| ${short(s.start)} | ${short(s.end)} | ${s.voice} | ${s.screen} |\n`;
}
writeFileSync(join(repo, "docs/videos/voix-off.md"), md);
console.log("docs/videos/voix-off.md écrit");
