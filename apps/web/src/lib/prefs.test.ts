import { describe, expect, it } from "vitest";
import { ALL_SPORTS, normalizeSportFilter, offeredSportSlugs, onlyOfferedSports, parsePrefs, serializePrefs } from "./prefs";

describe("device preferences cookie", () => {
  it("round-trips", () => {
    const p = { sports: ["petanque"], city: "Aubagne", lat: 43.29, lng: 5.57, radiusKm: 30 };
    expect(parsePrefs(serializePrefs(p))).toEqual({ ...p, postcode: undefined });
  });
  it("rejects garbage without throwing", () => {
    expect(parsePrefs(undefined)).toBeNull();
    expect(parsePrefs("not-json")).toBeNull();
    expect(parsePrefs(encodeURIComponent(JSON.stringify({ sports: "x" })))).toBeNull();
    expect(parsePrefs(encodeURIComponent(JSON.stringify({ sports: [1, "football"] })))?.sports).toEqual(["football"]);
  });
});

describe("pétanque only (football switched off)", () => {
  it("offers pétanque alone", () => {
    expect(offeredSportSlugs()).toEqual(["petanque"]);
  });
  it("brings an old os_sport=football cookie back to pétanque", () => {
    expect(normalizeSportFilter("football")).toBe("petanque");
    expect(normalizeSportFilter("curling")).toBe("petanque");
    expect(normalizeSportFilter("petanque")).toBe("petanque");
    expect(normalizeSportFilter(ALL_SPORTS)).toBe(ALL_SPORTS);
    expect(normalizeSportFilter(undefined)).toBe(ALL_SPORTS);
  });
  it("drops sports that are no longer offered", () => {
    expect(onlyOfferedSports(["football", "petanque"])).toEqual(["petanque"]);
    expect(onlyOfferedSports(["football"])).toEqual([]);
  });
});
