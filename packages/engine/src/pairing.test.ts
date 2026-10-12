import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  bracketSeedOrder,
  distributeInPools,
  fixedBracketFirstRound,
  meleeSides,
  poolSizes,
  randomPairing,
  roundRobinSchedule,
  swissPairing,
  type PairingTeam,
} from "./pairing";
import { pairKey } from "./queries";
import { createRng } from "./rng";

const teams = (n: number, club: (i: number) => string | null = () => null, seed: (i: number) => number | null = () => null): PairingTeam[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, club: club(i + 1), seed: seed(i + 1) }));

describe("random pairing", () => {
  it("uses every team exactly once and gives one bye when odd", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 129 }), fc.string(), (n, seed) => {
        const { pairs, bye } = randomPairing(teams(n), createRng(seed), { avoidSameClub: false });
        const ids = [...pairs.flat(), ...(bye ? [bye] : [])];
        expect(new Set(ids).size).toBe(n);
        expect(ids.length).toBe(n);
        expect(bye !== null).toBe(n % 2 === 1);
      }),
    );
  });

  it("never pairs two teams of the same club when it is possible", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 40 }), fc.integer({ min: 1, max: 8 }), fc.string(), (half, clubCount, seed) => {
        const n = half * 2;
        // Club sizes are capped so that a clean pairing always exists.
        const list = teams(n, (i) => `club-${i % clubCount}`);
        const sizes = new Map<string, number>();
        list.forEach((t) => sizes.set(t.club!, (sizes.get(t.club!) ?? 0) + 1));
        fc.pre(Math.max(...sizes.values()) <= n / 2);
        const { pairs } = randomPairing(list, createRng(seed), { avoidSameClub: true });
        const club = new Map(list.map((t) => [t.id, t.club]));
        expect(pairs.filter(([a, b]) => club.get(a) === club.get(b))).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it("gives the bye to a team that has not had one", () => {
    const byes = new Set(["t1", "t2", "t3", "t4"]);
    for (let s = 0; s < 50; s++) {
      const { bye } = randomPairing(teams(5), createRng(`s${s}`), { avoidSameClub: false, byes: (id) => (byes.has(id) ? 1 : 0) });
      expect(bye).toBe("t5");
    }
  });
});

describe("fixed bracket", () => {
  it("uses the standard seed order", () => {
    expect(bracketSeedOrder(2)).toEqual([1, 2]);
    expect(bracketSeedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(bracketSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("never puts two byes against each other and spreads them", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 130 }), fc.string(), (n, seed) => {
        let size = 1;
        while (size < n) size *= 2;
        const r1 = fixedBracketFirstRound(teams(n), size, createRng(seed), { avoidSameClub: false, seeding: false });
        expect(r1.length).toBe(size / 2);
        expect(r1.filter(([, b]) => b === null).length).toBe(size - n);
        expect(new Set(r1.flatMap(([a, b]) => [a, b]).filter(Boolean)).size).toBe(n);
      }),
    );
  });

  it("places seeds 1 and 2 in opposite halves and gives byes to top seeds", () => {
    const list = teams(6, () => null, (i) => (i <= 2 ? i : null));
    const r1 = fixedBracketFirstRound(list, 8, createRng("x"), { avoidSameClub: false, seeding: true });
    expect(r1[0]).toEqual(["t1", null]);
    expect(r1[2]![0]).toBe("t2");
    expect(r1[2]![1]).toBeNull();
  });
});

describe("swiss pairing", () => {
  it("avoids rematches when possible", () => {
    const order = ["a", "b", "c", "d", "e", "f"];
    const played = new Set([pairKey("a", "b"), pairKey("c", "d"), pairKey("e", "f")]);
    const pairs = swissPairing(order, played);
    for (const [x, y] of pairs) expect(played.has(pairKey(x, y))).toBe(false);
    expect(pairs.flat().sort()).toEqual(order);
  });
});

describe("round robin", () => {
  it("every pair meets exactly once", () => {
    for (const n of [2, 3, 4, 5, 8, 9]) {
      const ids = Array.from({ length: n }, (_, i) => `t${i}`);
      const rounds = roundRobinSchedule(ids);
      const seen = new Map<string, number>();
      for (const round of rounds) {
        const inRound = new Set<string>();
        for (const [a, b] of round) {
          if (!a || !b) continue;
          seen.set(pairKey(a, b), (seen.get(pairKey(a, b)) ?? 0) + 1);
          expect(inRound.has(a) || inRound.has(b)).toBe(false);
          inRound.add(a);
          inRound.add(b);
        }
      }
      expect(seen.size).toBe((n * (n - 1)) / 2);
      expect([...seen.values()].every((v) => v === 1)).toBe(true);
    }
  });
});

describe("pools", () => {
  it("splits teams into balanced pools", () => {
    expect(poolSizes(16, 4)).toEqual([4, 4, 4, 4]);
    expect(poolSizes(10, 4)).toEqual([4, 3, 3]);
    expect(poolSizes(5, 4)).toEqual([5]);
    for (let n = 3; n < 100; n++) {
      const sizes = poolSizes(n, 4);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });
  it("spreads clubs across pools", () => {
    const list = teams(16, (i) => `club-${i % 4}`);
    const pools = distributeInPools(list, [4, 4, 4, 4], createRng("p"), { seeding: false, avoidSameClub: true });
    const club = new Map(list.map((t) => [t.id, t.club]));
    for (const p of pools) expect(new Set(p.map((id) => club.get(id))).size).toBe(4);
  });
});

describe("mêlée tournante", () => {
  it("forms full sides and rests the leftovers", () => {
    const ids = Array.from({ length: 23 }, (_, i) => `p${i}`);
    const { matches, resting } = meleeSides(ids, 2, createRng("m"), new Set(), () => 0);
    expect(matches.length).toBe(5);
    expect(resting.length).toBe(3);
    expect(new Set([...matches.flat(2), ...resting]).size).toBe(23);
    for (const [a, b] of matches) expect([a.length, b.length]).toEqual([2, 2]);
  });
});
