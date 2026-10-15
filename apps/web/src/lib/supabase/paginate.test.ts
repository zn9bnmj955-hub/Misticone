import { describe, expect, it } from "vitest";
import { chunk, fetchAllRows, must } from "./paginate";

describe("fetchAllRows", () => {
  it("reads every page beyond max_rows (1 536 players of 512 triplets)", async () => {
    const all = Array.from({ length: 1536 }, (_, i) => i);
    const calls: [number, number][] = [];
    const rows = await fetchAllRows(async (from, to) => {
      calls.push([from, to]);
      return { data: all.slice(from, Math.min(to + 1, from + 1000)), error: null };
    });
    expect(rows).toEqual(all);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("asks one more page when the count is an exact multiple", async () => {
    let n = 0;
    const rows = await fetchAllRows(async (from) => {
      n++;
      return { data: from < 4 ? [from, from + 1] : [], error: null };
    }, 2);
    expect(rows).toEqual([0, 1, 2, 3]);
    expect(n).toBe(3);
  });

  it("throws instead of returning a truncated list", async () => {
    await expect(
      fetchAllRows(async (from) => (from === 0 ? { data: [1, 2], error: null } : { data: null, error: new Error("414") }), 2),
    ).rejects.toThrow("414");
  });
});

describe("chunk / must", () => {
  it("splits 512 ids into URL-safe packets", () => {
    const parts = chunk(Array.from({ length: 512 }, (_, i) => i));
    expect(parts.map((p) => p.length)).toEqual([100, 100, 100, 100, 100, 12]);
    expect(chunk([])).toEqual([]);
  });
  it("throws the response error", () => {
    expect(() => must({ data: null, error: new Error("boom") })).toThrow("boom");
    expect(must({ data: 3, error: null })).toBe(3);
  });
});
