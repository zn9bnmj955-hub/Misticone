import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fr } from "./fr";

/**
 * Owner's rule (lot 2, F1): the end of a competition cannot be predicted, so
 * no interface text ever shows an end time or a duration estimate. Closing
 * times of registrations / check-in ("Fin des inscriptions") are allowed.
 */
const FORBIDDEN = [
  /fin (estimée|prévue)/i,
  /heure de fin(?! des inscriptions| du pointage)/i,
  /finit (plus )?(tard|tôt)/i,
  /termin\w* vers/i,
  /\bdurée\b/i,
  // A video length ({duration} on the play button) is not a competition estimate.
  /\{(end|endTime|endDate)\}/,
];

function strings(value: unknown, path: string, out: [string, string][]): [string, string][] {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out);
  return out;
}

describe("no end time nor duration in the interface", () => {
  it("French messages never estimate an end time or a duration", () => {
    const hits = strings(fr, "", []).filter(([, text]) => FORBIDDEN.some((re) => re.test(text)));
    expect(hits).toEqual([]);
  });

  it("video subtitles never announce an end time", () => {
    const dir = join(__dirname, "../../public/videos");
    for (const file of ["tutoriel.vtt", "decouverte.vtt"]) {
      let text: string;
      try {
        text = readFileSync(join(dir, file), "utf8");
      } catch {
        continue;
      }
      expect(FORBIDDEN.filter((re) => re.test(text)).map(String), file).toEqual([]);
    }
  });
});
