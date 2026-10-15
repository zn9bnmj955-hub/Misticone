import { describe, expect, it } from "vitest";
import { createVersionedCache } from "./versioned-cache";

function setup() {
  let version: number | null = 1;
  let clock = 0;
  let loads = 0;
  const get = createVersionedCache({
    readVersion: async () => version,
    load: async (code) => ({ code, n: ++loads }),
    ttlMs: 15_000,
    now: () => clock,
  });
  return { get, setVersion: (v: number | null) => (version = v), tick: (ms: number) => (clock += ms), loads: () => loads };
}

describe("createVersionedCache", () => {
  it("loads the tournament once for 2 000 simultaneous readers of the same version", async () => {
    const c = setup();
    const all = await Promise.all(Array.from({ length: 2000 }, () => c.get("7KQ2")));
    expect(c.loads()).toBe(1);
    expect(new Set(all).size).toBe(1);
  });

  it("reloads when the version changes or the entry is too old", async () => {
    const c = setup();
    await c.get("7KQ2");
    c.setVersion(2);
    expect((await c.get("7KQ2"))?.n).toBe(2);
    c.tick(15_000);
    expect((await c.get("7KQ2"))?.n).toBe(3);
  });

  it("forgets a tournament that disappears and never keeps a failed load", async () => {
    let fail = true;
    const get = createVersionedCache({ readVersion: async () => 1, load: async () => { if (fail) throw new Error("db"); return 1; } });
    await expect(get("A")).rejects.toThrow("db");
    fail = false;
    expect(await get("A")).toBe(1);
    const c = setup();
    await c.get("A");
    c.setVersion(null);
    expect(await c.get("A")).toBeNull();
  });
});
