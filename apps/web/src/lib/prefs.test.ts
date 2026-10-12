import { describe, expect, it } from "vitest";
import { parsePrefs, serializePrefs } from "./prefs";

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
