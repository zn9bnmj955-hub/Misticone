/**
 * Seeded randomness. Every draw stores its seed, so a draw can always be
 * explained and replayed identically.
 */

/** 128-bit string hash (cyrb128), returned as four 32-bit integers. */
export function hash128(input: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, max). */
  int(max: number): number;
  shuffle<T>(items: readonly T[]): T[];
  pick<T>(items: readonly T[]): T;
}

/** sfc32 generator seeded from a string. */
export function createRng(seed: string): Rng {
  let [a, b, c, d] = hash128(seed);
  const next = () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // Warm up.
  for (let i = 0; i < 12; i++) next();
  const int = (max: number) => Math.floor(next() * max);
  return {
    next,
    int,
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error("pick from empty list");
      return items[int(items.length)]!;
    },
  };
}

/**
 * Deterministic UUID-shaped ids derived from an operation id. The client and
 * the server compute the same ids for the same command, which makes offline
 * actions replayable.
 */
export function createIdGenerator(opId: string): () => string {
  let counter = 0;
  return () => {
    const [a, b, c, d] = hash128(`${opId}#${counter++}`);
    const hex = [a, b, c, d].map((n) => n.toString(16).padStart(8, "0")).join("");
    const v = `${hex.slice(0, 12)}4${hex.slice(13, 16)}${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 32)}`;
    return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
  };
}
