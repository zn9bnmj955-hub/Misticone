import { describe, expect, it } from "vitest";
import { terrainCacheHeaders } from "./cache-headers";

describe("terrainCacheHeaders", () => {
  it("full pages are never cached", () => {
    expect(terrainCacheHeaders({ code: "7KQ2", fragment: false, mine: false, message: false })).toEqual({ "cache-control": "no-store" });
  });

  it("a fragment without team cookie is shared a few seconds, keyed on the team cookie", () => {
    const h = terrainCacheHeaders({ code: "7KQ2", fragment: true, mine: false, message: false });
    expect(h["cache-control"]).toBe("public, max-age=0, s-maxage=4, stale-while-revalidate=4");
    expect(h["netlify-vary"]).toBe("cookie=os_t_7KQ2");
    expect(h.vary).toBe("Cookie");
  });

  it("a fragment for a phone with its team cookie (or a message) is never stored, and still varies", () => {
    for (const o of [{ mine: true, message: false }, { mine: false, message: true }]) {
      const h = terrainCacheHeaders({ code: "7KQ2", fragment: true, ...o });
      expect(h["cache-control"]).toBe("no-store");
      expect(h["netlify-vary"]).toBe("cookie=os_t_7KQ2");
      expect(h.vary).toBe("Cookie");
    }
  });
});
