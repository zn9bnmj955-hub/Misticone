import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * V2 acceptance: the static fallback of the landing ball (shown when 3D is not loaded)
 * is the boule only, a real 560 px WebP (same size as the <img> in SportHero), and light.
 */
const dir = fileURLToPath(new URL("../../../public/vitrine/", import.meta.url));

function webpSize(buf: Buffer): { width: number; height: number } {
  expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buf.toString("ascii", 8, 12)).toBe("WEBP");
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (chunk === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  expect(chunk).toBe("VP8 ");
  return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
}

describe("landing still image", () => {
  it("keeps only the boule (no football image left)", () => {
    expect(readdirSync(dir).filter((f) => f.endsWith(".webp"))).toEqual(["ball.webp"]);
  });

  it("is a 560 px square WebP matching the <img> of the hero, under 30 KB", () => {
    const buf = readFileSync(dir + "ball.webp");
    expect(webpSize(buf)).toEqual({ width: 560, height: 560 });
    expect(buf.length).toBeLessThan(30 * 1024);
    const hero = readFileSync(fileURLToPath(new URL("./SportHero.tsx", import.meta.url)), "utf8");
    expect(hero).toMatch(/width=\{560\} height=\{560\}/);
  });
});
