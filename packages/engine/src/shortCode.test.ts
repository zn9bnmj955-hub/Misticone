import { describe, expect, it } from "vitest";
import { generateShortCode, isShortCode, normalizeShortCode, SHORT_CODE_ALPHABET } from "./shortCode";

describe("short codes", () => {
  it("never contains ambiguous characters", () => {
    for (const c of "01OIL") expect(SHORT_CODE_ALPHABET).not.toContain(c);
    for (let i = 0; i < 500; i++) expect(isShortCode(generateShortCode())).toBe(true);
  });
  it("is deterministic with a given random source", () => {
    expect(generateShortCode(() => 0)).toBe("2222");
    expect(generateShortCode(() => 0.9999)).toBe("ZZZZ");
  });
  it("normalizes typed and scanned input", () => {
    expect(normalizeShortCode(" 7kq-2 ")).toBe("7KQ2");
    expect(normalizeShortCode("https://orgasport.fr/c/7KQ2?x=1")).toBe("7KQ2");
    expect(isShortCode(normalizeShortCode("7kq2"))).toBe(true);
    expect(isShortCode("70Q2")).toBe(false);
  });
});
