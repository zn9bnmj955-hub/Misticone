import type { Rng } from "./rng";
import { pairKey } from "./queries";

export interface PairingTeam {
  id: string;
  club: string | null;
  seed: number | null;
}

export type Pair = [string, string];

type Slot = PairingTeam | null;

const sameClub = (a: Slot, b: Slot) => a !== null && b !== null && a.club !== null && a.club !== "" && a.club === b.club;

function countConflicts(pairs: [Slot, Slot][]): number {
  return pairs.filter(([a, b]) => sameClub(a, b)).length;
}

/**
 * Repairs same-club pairs by swapping partners with other pairs. Teams in
 * `locked` keep their partner (seeded positions, for instance).
 */
function repairClubConflicts(pairs: [Slot, Slot][], rng: Rng, locked: Set<string> = new Set()): void {
  // An empty slot (bye) can never move: only teams swap places.
  const movable = (t: Slot) => t !== null && !locked.has(t.id);
  for (let iter = 0; iter < pairs.length * 20; iter++) {
    const bad = pairs.findIndex(([a, b]) => sameClub(a, b));
    if (bad === -1) return;
    const [a, b] = pairs[bad]! as [PairingTeam, PairingTeam];
    // Move the unlocked member of the bad pair.
    const moveSide = !movable(b) ? (!movable(a) ? -1 : 0) : 1;
    if (moveSide === -1) return;
    const keep = moveSide === 1 ? a : b;
    const mover = moveSide === 1 ? b : a;
    const candidates: [number, 0 | 1][] = [];
    pairs.forEach(([x, y], j) => {
      if (j === bad) return;
      if (movable(x) && !sameClub(keep, x) && !sameClub(mover, y)) candidates.push([j, 0]);
      if (movable(y) && !sameClub(keep, y) && !sameClub(mover, x)) candidates.push([j, 1]);
    });
    if (candidates.length === 0) return;
    const [j, k] = rng.pick(candidates);
    const other = pairs[j]![k]!;
    pairs[j]![k] = mover;
    pairs[bad] = moveSide === 1 ? [keep, other] : [other, keep];
  }
}

/**
 * Greedy fallback that always finds a conflict-free pairing when one exists:
 * repeatedly pair a team of the largest remaining club with a team of
 * another club.
 */
function greedyByClub(teams: PairingTeam[], rng: Rng): [PairingTeam, PairingTeam][] {
  const groups = new Map<string, PairingTeam[]>();
  for (const t of rng.shuffle(teams)) {
    const key = t.club ? `c:${t.club}` : `solo:${t.id}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const pairs: [PairingTeam, PairingTeam][] = [];
  while ([...groups.values()].reduce((n, g) => n + g.length, 0) >= 2) {
    const sorted = [...groups.entries()].filter(([, g]) => g.length > 0).sort((x, y) => y[1].length - x[1].length);
    const [k1, g1] = sorted[0]!;
    const second = sorted[1];
    const a = g1.pop()!;
    const b = second ? second[1].pop()! : g1.pop()!;
    pairs.push([a, b]);
    if (g1.length === 0) groups.delete(k1);
    if (second && second[1].length === 0) groups.delete(second[0]);
  }
  return pairs;
}

/** Picks the team that sits out (odd count): never one that already had a bye if avoidable. */
export function chooseBye(teams: PairingTeam[], rng: Rng, byes: (id: string) => number): PairingTeam {
  const min = Math.min(...teams.map((t) => byes(t.id)));
  return rng.pick(teams.filter((t) => byes(t.id) === min));
}

/**
 * Random pairing with an optional bye and same-club avoidance.
 * Returns pairs in random order and the team that sits out (if odd).
 */
export function randomPairing(
  teams: PairingTeam[],
  rng: Rng,
  opts: { avoidSameClub: boolean; byes?: (id: string) => number },
): { pairs: Pair[]; bye: string | null } {
  let pool = [...teams];
  let bye: string | null = null;
  if (pool.length % 2 === 1) {
    const b = chooseBye(pool, rng, opts.byes ?? (() => 0));
    bye = b.id;
    pool = pool.filter((t) => t.id !== b.id);
  }
  const shuffled = rng.shuffle(pool);
  let pairs: [PairingTeam, PairingTeam][] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) pairs.push([shuffled[i]!, shuffled[i + 1]!]);
  if (opts.avoidSameClub && countConflicts(pairs) > 0) {
    repairClubConflicts(pairs as [Slot, Slot][], rng);
    if (countConflicts(pairs) > 0) {
      const greedy = greedyByClub(pool, rng);
      if (countConflicts(greedy) < countConflicts(pairs)) pairs = rng.shuffle(greedy);
    }
  }
  return { pairs: pairs.map(([a, b]) => (rng.next() < 0.5 ? [a.id, b.id] : [b.id, a.id])), bye };
}

/**
 * Seed order of a power-of-two bracket: position i (0-based) receives seed
 * order[i]. 1 and 2 can only meet in the final, 1-4 in the semis, etc.
 */
export function bracketSeedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

/**
 * First round of a fixed bracket of `size` slots (power of two). Seeds take
 * their seeded positions, the other teams are drawn at random, and byes go to
 * the best-placed teams so that two byes never face each other.
 * Returns one entry per first-round match: [teamA, teamB | null].
 */
export function fixedBracketFirstRound(
  teams: PairingTeam[],
  size: number,
  rng: Rng,
  opts: { avoidSameClub: boolean; seeding: boolean },
): [string, string | null][] {
  const seeded = opts.seeding ? teams.filter((t) => t.seed != null).sort((a, b) => a.seed! - b.seed!) : [];
  const others = rng.shuffle(teams.filter((t) => !seeded.includes(t)));
  // Rank 1..n = seeds first, then the drawn teams. Ranks n+1..size are byes.
  const byRank: (PairingTeam | null)[] = [...seeded, ...others];
  while (byRank.length < size) byRank.push(null);
  const order = bracketSeedOrder(size);
  const slots = order.map((rank) => byRank[rank - 1] ?? null);

  const pairs: [PairingTeam | null, PairingTeam | null][] = [];
  for (let i = 0; i < size; i += 2) pairs.push([slots[i] ?? null, slots[i + 1] ?? null]);

  if (opts.avoidSameClub) repairClubConflicts(pairs, rng, new Set(seeded.map((t) => t.id)));
  return pairs.map(([a, b]) => {
    if (a && b) return [a.id, b.id];
    const only = (a ?? b)!;
    return [only.id, null];
  });
}

/**
 * Swiss pairing: teams ordered best first; pair neighbours that have not met
 * yet (backtracking). Falls back to allowing rematches if impossible.
 */
export function swissPairing(ordered: string[], played: Set<string>): Pair[] {
  const n = ordered.length;
  const used = new Array<boolean>(n).fill(false);
  const result: Pair[] = [];
  let budget = 20000;

  const solve = (): boolean => {
    const i = used.indexOf(false);
    if (i === -1) return true;
    used[i] = true;
    for (let j = i + 1; j < n; j++) {
      if (used[j] || played.has(pairKey(ordered[i]!, ordered[j]!))) continue;
      if (--budget < 0) break;
      used[j] = true;
      result.push([ordered[i]!, ordered[j]!]);
      if (solve()) return true;
      result.pop();
      used[j] = false;
    }
    used[i] = false;
    return false;
  };

  if (solve()) return result;
  // Rematches unavoidable: plain neighbour pairing.
  const fallback: Pair[] = [];
  for (let i = 0; i + 1 < n; i += 2) fallback.push([ordered[i]!, ordered[i + 1]!]);
  return fallback;
}

/** Round-robin schedule (circle method). Each round lists its pairs; null = sits out. */
export function roundRobinSchedule(ids: string[]): [string | null, string | null][][] {
  const list: (string | null)[] = [...ids];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: [string | null, string | null][][] = [];
  const arr = [...list];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string | null, string | null][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]!;
      const b = arr[n - 1 - i]!;
      // Alternate sides so nobody is always "A".
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    // Rotate all but the first.
    arr.splice(1, 0, arr.pop()!);
  }
  return rounds;
}

/** Splits n teams into pools of `size` (some pools one smaller), never below 3 when avoidable. */
export function poolSizes(n: number, size: number): number[] {
  if (n <= size + 1) return [n];
  const count = Math.ceil(n / size);
  const base = Math.floor(n / count);
  const extra = n % count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Distributes teams into pools: seeds snake across pools, then the others at
 * random, spreading clubs so that teams of the same club avoid each other.
 */
export function distributeInPools(teams: PairingTeam[], sizes: number[], rng: Rng, opts: { seeding: boolean; avoidSameClub: boolean }): string[][] {
  const pools: PairingTeam[][] = sizes.map(() => []);
  const seeded = opts.seeding ? teams.filter((t) => t.seed != null).sort((a, b) => a.seed! - b.seed!) : [];
  const rest = rng.shuffle(teams.filter((t) => !seeded.includes(t)));
  let idx = 0;
  let dir = 1;
  const nextPool = () => {
    const p = idx;
    idx += dir;
    if (idx === pools.length || idx === -1) {
      dir = -dir;
      idx += dir;
    }
    return p;
  };
  for (const t of seeded) {
    let p = nextPool();
    while (pools[p]!.length >= sizes[p]!) p = nextPool();
    pools[p]!.push(t);
  }
  for (const t of rest) {
    const open = pools.map((p, i) => i).filter((i) => pools[i]!.length < sizes[i]!);
    let choices = open;
    if (opts.avoidSameClub && t.club) {
      const clean = open.filter((i) => !pools[i]!.some((x) => x.club === t.club));
      if (clean.length) choices = clean;
    }
    // Fill the emptiest pools first so sizes stay balanced.
    const minFill = Math.min(...choices.map((i) => pools[i]!.length / sizes[i]!));
    const best = choices.filter((i) => pools[i]!.length / sizes[i]! === minFill);
    pools[rng.pick(best)]!.push(t);
  }
  return pools.map((p) => p.map((t) => t.id));
}

/**
 * Mêlée tournante: forms sides of `size` players from individuals, trying to
 * avoid repeated partners. Returns matches as [sideA, sideB] and the players
 * who sit out this round.
 */
export function meleeSides(
  individuals: string[],
  size: number,
  rng: Rng,
  partners: Set<string>,
  byes: (id: string) => number,
): { matches: [string[], string[]][]; resting: string[] } {
  const perMatch = size * 2;
  const restCount = individuals.length % perMatch;
  let best: { matches: [string[], string[]][]; resting: string[]; penalty: number } | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    // Players who sat out least often are the first candidates to rest.
    const byByes = rng.shuffle(individuals).sort((a, b) => byes(a) - byes(b));
    const resting = restCount ? rng.shuffle(byByes.slice(0, Math.max(restCount, 0))).slice(0, restCount) : [];
    const playing = rng.shuffle(individuals.filter((p) => !resting.includes(p)));
    const matches: [string[], string[]][] = [];
    let penalty = 0;
    for (let i = 0; i + perMatch <= playing.length; i += perMatch) {
      const a = playing.slice(i, i + size);
      const b = playing.slice(i + size, i + perMatch);
      for (const side of [a, b])
        for (let x = 0; x < side.length; x++) for (let y = x + 1; y < side.length; y++) if (partners.has(pairKey(side[x]!, side[y]!))) penalty++;
      matches.push([a, b]);
    }
    if (!best || penalty < best.penalty) best = { matches, resting, penalty };
    if (penalty === 0) break;
  }
  return { matches: best!.matches, resting: best!.resting };
}
