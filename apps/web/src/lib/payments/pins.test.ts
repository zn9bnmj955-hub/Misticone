import { describe, expect, it } from "vitest";
import { generatePins, isWeakPin } from "./pins";

describe("generatePins", () => {
  it("returns the requested number of distinct 6-digit codes", () => {
    for (const count of [0, 1, 3, 10]) {
      const pins = generatePins(count);
      expect(pins).toHaveLength(count);
      expect(new Set(pins).size).toBe(count);
      for (const pin of pins) expect(pin).toMatch(/^\d{6}$/);
    }
  });

  it("keeps leading zeros", () => {
    expect(generatePins(1, () => 42)).toEqual(["000042"]);
  });

  it("skips duplicates and obvious codes", () => {
    const values = [111111, 123456, 504312, 504312, 987654, 270918];
    let i = 0;
    expect(generatePins(2, () => values[i++]!)).toEqual(["504312", "270918"]);
  });

  it("stops instead of looping forever on a broken random source", () => {
    expect(() => generatePins(2, () => 7)).toThrow();
  });
});

describe("isWeakPin", () => {
  it("spots repeated and sequential digits", () => {
    expect(isWeakPin("000000")).toBe(true);
    expect(isWeakPin("123456")).toBe(true);
    expect(isWeakPin("654321")).toBe(true);
    expect(isWeakPin("482193")).toBe(false);
    expect(isWeakPin("135791")).toBe(false);
  });
});
