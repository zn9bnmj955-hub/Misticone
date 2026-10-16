import { compareRounds, isFixedTree, isWalkover, propagateFixed, unpropagateFixed } from "./bracket";
import { fail } from "./errors";
import {
  byeCount,
  eligibleTeams,
  hasResult,
  isFinished,
  isRoundComplete,
  lastRound,
  loserTeams,
  matchesOfRound,
  nextPowerOfTwo,
  pairKey,
  playedPairs,
  roundsOf,
  winnerTeams,
} from "./queries";
import {
  distributeInPools,
  fixedBracketFirstRound,
  meleeSides,
  poolSizes,
  randomPairing,
  roundRobinSchedule,
  swissPairing,
  type PairingTeam,
} from "./pairing";
import { createRng } from "./rng";
import { eliminationRanking, rankTeams } from "./standings";
import type { Transaction } from "./tx";
import type { Bracket, EngineContext, EngineState, Match, Phase, Round, RoundStatus, Team } from "./types";

export interface DrawContext extends EngineContext {
  /** Base seed of this draw; sub-draws derive their own seed from it. */
  seed: string;
}

const toPairing = (t: Team): PairingTeam => ({ id: t.id, club: t.club, seed: t.seed });
const OUT: ReadonlySet<Team["status"]> = new Set(["forfeit", "withdrawn"]);
const stillIn = (state: EngineState) => (id: string) => {
  const t = state.teams[id];
  return Boolean(t) && !OUT.has(t!.status);
};

export function poolLabel(index: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return index < 26 ? letters[index]! : `${letters[Math.floor(index / 26) - 1]}${letters[index % 26]}`;
}

export function defaultSwissRounds(teams: number): number {
  return Math.max(3, Math.ceil(Math.log2(Math.max(2, teams))));
}

export function totalRounds(state: EngineState, phase: "swiss" | "melee", participants: number): number {
  const cfg = state.tournament.config;
  if (cfg.rounds) return cfg.rounds;
  return phase === "swiss" ? defaultSwissRounds(participants) : 4;
}

// ---------------------------------------------------------------------------
// Entity helpers
// ---------------------------------------------------------------------------

function newRound(tx: Transaction, ctx: DrawContext, bracket: Bracket, phase: Phase, number: number, status: RoundStatus): Round {
  return tx.create("round", {
    id: ctx.newId(),
    bracket,
    phase,
    number,
    status,
    seed: status === "pending" ? null : `${ctx.seed}:${bracket}:${phase}:${number}`,
    drawnAt: status === "pending" ? null : ctx.now,
  });
}

/** Creates a match; its status follows from the sides (playable, bye, empty). */
export function newMatch(
  tx: Transaction,
  ctx: EngineContext,
  round: Round,
  position: number,
  sideA: string[],
  sideB: string[],
  pool: string | null = null,
  pending = false,
): Match {
  let a = sideA;
  let b = sideB;
  let status: Match["status"];
  let winner: Match["winner"] = null;
  if (pending) status = "pending";
  else if (a.length && b.length) status = "waiting_venue";
  else if (a.length || b.length) {
    status = "bye";
    winner = "A";
    if (!a.length) [a, b] = [b, []];
  } else status = "forfeit";
  return tx.create("match", {
    id: ctx.newId(),
    roundId: round.id,
    position,
    pool,
    sideA: a,
    sideB: b,
    venueId: null,
    scheduledAt: null,
    startedAt: null,
    endedAt: null,
    queuedAt: status === "waiting_venue" ? ctx.now : null,
    scoreA: null,
    scoreB: null,
    tiebreakA: null,
    tiebreakB: null,
    winner,
    status,
  });
}

function deleteRound(tx: Transaction, roundId: string): void {
  for (const m of matchesOfRound(tx.state, roundId)) tx.remove("match", m.id);
  tx.remove("round", roundId);
}

// ---------------------------------------------------------------------------
// Elimination (main or consolation bracket, or the final phase after pools)
// ---------------------------------------------------------------------------

function buildFixedTree(tx: Transaction, ctx: DrawContext, bracket: Bracket, phase: Phase, teams: PairingTeam[], opts: { avoidSameClub: boolean; seeding: boolean }): void {
  const rng = createRng(`${ctx.seed}:${bracket}:${phase}:tree`);
  const size = nextPowerOfTwo(teams.length);
  const roundsCount = Math.log2(size);
  const first = fixedBracketFirstRound(teams, size, rng, opts);
  const rounds: Round[] = [];
  for (let r = 1; r <= roundsCount; r++) rounds.push(newRound(tx, ctx, bracket, phase, r, r === 1 ? "drawn" : "pending"));
  const r1: Match[] = first.map(([a, b], i) => newMatch(tx, ctx, rounds[0]!, i + 1, [a], b ? [b] : []));
  for (let r = 2; r <= roundsCount; r++) {
    const count = size / 2 ** r;
    for (let p = 1; p <= count; p++) newMatch(tx, ctx, rounds[r - 1]!, p, [], [], null, true);
  }
  for (const m of r1) if (m.status === "bye") propagateFixed(tx, m.id, ctx);
}

function drawRedrawRound(tx: Transaction, ctx: DrawContext, bracket: Bracket, phase: Phase, number: number, teams: Team[], avoidSameClub: boolean): void {
  const rng = createRng(`${ctx.seed}:${bracket}:${phase}:${number}`);
  const { pairs, bye } = randomPairing(teams.map(toPairing), rng, {
    avoidSameClub,
    byes: (id) => byeCount(tx.state, id, bracket),
  });
  const round = newRound(tx, ctx, bracket, phase, number, "drawn");
  pairs.forEach(([a, b], i) => newMatch(tx, ctx, round, i + 1, [a], [b]));
  if (bye) newMatch(tx, ctx, round, pairs.length + 1, [bye], []);
}

function drawElimination(tx: Transaction, ctx: DrawContext, bracket: Bracket, phase: Phase, entrants: () => PairingTeam[], firstRoundOpts: { avoidSameClub: boolean; seeding: boolean }): void {
  const state = tx.state;
  const rounds = roundsOf(state, bracket, phase);
  const fixed = phase === "final" || state.tournament.config.bracketMode === "fixed";
  if (rounds.length === 0) {
    const teams = entrants();
    if (teams.length < 2) fail("NOT_ENOUGH_TEAMS", { count: teams.length });
    if (fixed) return buildFixedTree(tx, ctx, bracket, phase, teams, firstRoundOpts);
    return drawRedrawRound(tx, ctx, bracket, phase, 1, teams.map((t) => state.teams[t.id]!), firstRoundOpts.avoidSameClub);
  }
  if (fixed) fail("ROUND_ALREADY_DRAWN");
  const last = rounds[rounds.length - 1]!;
  if (!isRoundComplete(state, last.id)) fail("ROUND_INCOMPLETE", { round: last.number });
  const winners = [...new Set(matchesOfRound(state, last.id).flatMap(winnerTeams))].filter(stillIn(state));
  if (winners.length < 2) fail("NOTHING_TO_DRAW");
  drawRedrawRound(tx, ctx, bracket, phase, last.number + 1, winners.map((id) => state.teams[id]!), false);
}

// ---------------------------------------------------------------------------
// Pools then final phase
// ---------------------------------------------------------------------------

export function poolMatches(state: EngineState, label: string): Match[] {
  return Object.values(state.matches).filter((m) => m.pool === label && state.rounds[m.roundId]?.phase === "pool");
}

export function poolTeams(state: EngineState, label: string): string[] {
  const ids = new Set<string>();
  for (const m of poolMatches(state, label)) [...m.sideA, ...m.sideB].forEach((id) => ids.add(id));
  return [...ids].sort((a, b) => (state.teams[a]?.number ?? 0) - (state.teams[b]?.number ?? 0));
}

export function poolLabels(state: EngineState): string[] {
  return [...new Set(Object.values(state.matches).filter((m) => m.pool && state.rounds[m.roundId]?.phase === "pool").map((m) => m.pool!))].sort(
    (a, b) => a.length - b.length || a.localeCompare(b),
  );
}

const isGslPool = (state: EngineState, label: string) => state.tournament.config.pools.system === "gsl" && poolTeams(state, label).length === 4;

function byPoolRound(state: EngineState, label: string): Map<number, Match[]> {
  const out = new Map<number, Match[]>();
  for (const m of poolMatches(state, label)) {
    const n = state.rounds[m.roundId]!.number;
    out.set(n, [...(out.get(n) ?? []), m].sort((a, b) => a.position - b.position));
  }
  return out;
}

export function isPoolComplete(state: EngineState, label: string): boolean {
  const ms = poolMatches(state, label);
  if (ms.length === 0 || !ms.every(isFinished)) return false;
  if (isGslPool(state, label)) return (byPoolRound(state, label).get(3)?.length ?? 0) > 0;
  return true;
}

/** Final order of a pool (best first). */
export function poolRanking(state: EngineState, label: string): string[] {
  if (isGslPool(state, label)) {
    const rounds = byPoolRound(state, label);
    const r1Winners = new Set((rounds.get(1) ?? []).flatMap(winnerTeams));
    const r2 = rounds.get(2) ?? [];
    const wm = r2.find((m) => [...m.sideA, ...m.sideB].some((id) => r1Winners.has(id)));
    const lm = r2.find((m) => m !== wm);
    const barrage = rounds.get(3)?.[0];
    const order = [
      ...(wm ? winnerTeams(wm) : []),
      ...(barrage ? winnerTeams(barrage) : []),
      ...(barrage ? loserTeams(barrage) : []),
      ...(lm ? loserTeams(lm) : []),
    ];
    const rest = poolTeams(state, label).filter((id) => !order.includes(id));
    return [...new Set([...order, ...rest])];
  }
  return rankTeams(state, poolTeams(state, label), poolMatches(state, label), state.tournament.config.ranking, `${state.tournament.id}:pool:${label}`).map((r) => r.id);
}

function drawPools(tx: Transaction, ctx: DrawContext): void {
  const state = tx.state;
  const cfg = state.tournament.config;
  const teams = eligibleTeams(state);
  if (teams.length < 3) fail("NOT_ENOUGH_TEAMS", { count: teams.length });
  const rng = createRng(`${ctx.seed}:pools`);
  const sizes = poolSizes(teams.length, cfg.pools.size);
  const pools = distributeInPools(teams.map(toPairing), sizes, rng, { seeding: cfg.draw.seeding, avoidSameClub: cfg.draw.avoidSameClubFirstRound });

  const plans = pools.map((members, i) => {
    const label = poolLabel(i);
    if (cfg.pools.system === "gsl" && members.length === 4) {
      const [a, b, c, d] = members as [string, string, string, string];
      return { label, rounds: [[[a, d], [b, c]]] as [string | null, string | null][][], gsl: true };
    }
    return { label, rounds: roundRobinSchedule(rng.shuffle(members)), gsl: false };
  });
  const roundCount = Math.max(...plans.map((p) => (p.gsl ? 3 : p.rounds.length)));
  const rounds: Round[] = [];
  for (let r = 1; r <= roundCount; r++) rounds.push(newRound(tx, ctx, "main", "pool", r, "drawn"));
  const positions = new Map<number, number>();
  for (const plan of plans) {
    plan.rounds.forEach((pairs, r) => {
      for (const [a, b] of pairs) {
        if (!a || !b) continue;
        const pos = (positions.get(r) ?? 0) + 1;
        positions.set(r, pos);
        newMatch(tx, ctx, rounds[r]!, pos, [a], [b], plan.label);
      }
    });
  }
}

/** Pétanque-style pool of 4: winners' match, losers' match, then a decider. */
function gslProgress(tx: Transaction, ctx: EngineContext, label: string): void {
  const state = tx.state;
  if (!isGslPool(state, label)) return;
  const rounds = byPoolRound(state, label);
  const poolRound = (n: number) => roundsOf(state, "main", "pool").find((r) => r.number === n);
  const nextPos = (round: Round) => Math.max(0, ...matchesOfRound(tx.state, round.id).map((m) => m.position)) + 1;
  const r1 = rounds.get(1) ?? [];
  if (r1.length === 2 && r1.every(isFinished) && !rounds.get(2)) {
    const round = poolRound(2)!;
    newMatch(tx, ctx, round, nextPos(round), winnerTeams(r1[0]!), winnerTeams(r1[1]!), label);
    newMatch(tx, ctx, round, nextPos(round), loserTeams(r1[0]!), loserTeams(r1[1]!), label);
    return;
  }
  const r2 = rounds.get(2) ?? [];
  if (r2.length === 2 && r2.every(isFinished) && !rounds.get(3)) {
    const r1Winners = new Set(r1.flatMap(winnerTeams));
    const wm = r2.find((m) => [...m.sideA, ...m.sideB].some((id) => r1Winners.has(id)))!;
    const lm = r2.find((m) => m !== wm)!;
    const round = poolRound(3)!;
    newMatch(tx, ctx, round, nextPos(round), loserTeams(wm), winnerTeams(lm), label);
  }
}

/**
 * Qualified teams of each pool. A team that withdrew or forfeited is set aside
 * BEFORE the cut, so the next team of its pool takes the place — as long as
 * the final phase does not include it yet. Once the final phase is drawn, the
 * teams in it keep their place (a later forfeit is played as a forfeit), and a
 * team already engaged in the consolation bracket is never promoted.
 */
export function qualifiers(state: EngineState): { id: string; pool: string; place: number }[] {
  const q = state.tournament.config.pools.qualifiers;
  const inFinal = new Set<string>();
  const inConsolation = new Set<string>();
  for (const m of Object.values(state.matches)) {
    const r = state.rounds[m.roundId];
    const set = r?.bracket === "main" && r.phase === "final" ? inFinal : r?.bracket === "consolation" ? inConsolation : null;
    if (set) for (const id of [...m.sideA, ...m.sideB]) set.add(id);
  }
  const eligible = (id: string) => inFinal.has(id) || (stillIn(state)(id) && !inConsolation.has(id));
  return poolLabels(state).flatMap((label) =>
    poolRanking(state, label)
      .filter(eligible)
      .slice(0, q)
      .map((id, i) => ({ id, pool: label, place: i + 1 })),
  );
}

function drawFinalPhase(tx: Transaction, ctx: DrawContext): void {
  const state = tx.state;
  const labels = poolLabels(state);
  if (!labels.every((l) => isPoolComplete(state, l))) fail("ROUND_INCOMPLETE");
  const q = qualifiers(state).filter((x) => stillIn(state)(x.id));
  // Pool winners are seeded; runners-up are drawn, never against their own pool.
  const teams: PairingTeam[] = q.map((x) => ({ id: x.id, club: `pool:${x.pool}`, seed: x.place === 1 ? labels.indexOf(x.pool) + 1 : null }));
  drawElimination(tx, ctx, "main", "final", () => teams, { avoidSameClub: true, seeding: true });
}

// ---------------------------------------------------------------------------
// Consolation ("concours complémentaire")
// ---------------------------------------------------------------------------

function consolationEntrants(state: EngineState): PairingTeam[] {
  const cfg = state.tournament.config;
  if (cfg.format === "pools_then_bracket") {
    const labels = poolLabels(state);
    if (labels.length === 0 || !labels.every((l) => isPoolComplete(state, l))) fail("ROUND_INCOMPLETE");
    const qualified = new Set(qualifiers(state).map((x) => x.id));
    return labels.flatMap((l) => poolTeams(state, l)).filter((id) => !qualified.has(id) && stillIn(state)(id)).map((id) => toPairing(state.teams[id]!));
  }
  const source = roundsOf(state, "main", "elimination").find((r) => r.number === cfg.consolation.losersOfRound);
  if (!source || !isRoundComplete(state, source.id)) fail("ROUND_INCOMPLETE", { round: cfg.consolation.losersOfRound });
  const losers = matchesOfRound(state, source.id).flatMap(loserTeams);
  return [...new Set(losers)].filter(stillIn(state)).map((id) => toPairing(state.teams[id]!));
}

// ---------------------------------------------------------------------------
// Swiss, round robin ("championnat"), mêlée tournante
// ---------------------------------------------------------------------------

function participants(state: EngineState, phase: Phase): string[] {
  const first = roundsOf(state, "main", phase)[0];
  if (!first) return eligibleTeams(state).map((t) => t.id);
  const ids = new Set(matchesOfRound(state, first.id).flatMap((m) => [...m.sideA, ...m.sideB]));
  return [...ids].filter(stillIn(state));
}

function drawSwiss(tx: Transaction, ctx: DrawContext): void {
  const state = tx.state;
  const rounds = roundsOf(state, "main", "swiss");
  const ids = participants(state, "swiss");
  if (ids.length < 2) fail("NOT_ENOUGH_TEAMS", { count: ids.length });
  const total = totalRounds(state, "swiss", ids.length);
  const last = rounds[rounds.length - 1];
  if (last && !isRoundComplete(state, last.id)) fail("ROUND_INCOMPLETE", { round: last.number });
  if (rounds.length >= total) fail("NOTHING_TO_DRAW");
  const number = rounds.length + 1;
  const rng = createRng(`${ctx.seed}:main:swiss:${number}`);
  const round = newRound(tx, ctx, "main", "swiss", number, "drawn");

  if (number === 1) {
    const { pairs, bye } = randomPairing(ids.map((id) => toPairing(state.teams[id]!)), rng, {
      avoidSameClub: state.tournament.config.draw.avoidSameClubFirstRound,
    });
    pairs.forEach(([a, b], i) => newMatch(tx, ctx, round, i + 1, [a], [b]));
    if (bye) newMatch(tx, ctx, round, pairs.length + 1, [bye], []);
    return;
  }
  const matches = Object.values(state.matches).filter((m) => state.rounds[m.roundId]?.phase === "swiss");
  const ranked = rankTeams(state, ids, matches, state.tournament.config.ranking, `${ctx.seed}:rank:${number}`).map((r) => r.id);
  let order = ranked;
  let bye: string | null = null;
  if (order.length % 2 === 1) {
    const minByes = Math.min(...order.map((id) => byeCount(state, id)));
    bye = [...order].reverse().find((id) => byeCount(state, id) === minByes)!;
    order = order.filter((id) => id !== bye);
  }
  const pairs = swissPairing(order, playedPairs(state, "main"));
  pairs.forEach(([a, b], i) => newMatch(tx, ctx, round, i + 1, [a], [b]));
  if (bye) newMatch(tx, ctx, round, pairs.length + 1, [bye], []);
}

function drawLeague(tx: Transaction, ctx: DrawContext): void {
  const state = tx.state;
  if (roundsOf(state, "main", "league").length) fail("ROUND_ALREADY_DRAWN");
  const teams = eligibleTeams(state);
  if (teams.length < 2) fail("NOT_ENOUGH_TEAMS", { count: teams.length });
  const rng = createRng(`${ctx.seed}:main:league`);
  const schedule = roundRobinSchedule(rng.shuffle(teams.map((t) => t.id)));
  schedule.forEach((pairs, r) => {
    const round = newRound(tx, ctx, "main", "league", r + 1, "drawn");
    let pos = 0;
    for (const [a, b] of pairs) if (a && b) newMatch(tx, ctx, round, ++pos, [a], [b]);
  });
}

function drawMelee(tx: Transaction, ctx: DrawContext): void {
  const state = tx.state;
  const rounds = roundsOf(state, "main", "melee");
  const ids = participants(state, "melee");
  const size = state.rules.teamSize;
  if (ids.length < size * 2) fail("NOT_ENOUGH_TEAMS", { count: ids.length });
  const total = totalRounds(state, "melee", ids.length);
  const last = rounds[rounds.length - 1];
  if (last && !isRoundComplete(state, last.id)) fail("ROUND_INCOMPLETE", { round: last.number });
  if (rounds.length >= total) fail("NOTHING_TO_DRAW");
  const number = rounds.length + 1;
  const rng = createRng(`${ctx.seed}:main:melee:${number}`);
  const partners = new Set<string>();
  for (const m of Object.values(state.matches)) {
    if (state.rounds[m.roundId]?.phase !== "melee") continue;
    for (const side of [m.sideA, m.sideB])
      for (let i = 0; i < side.length; i++) for (let j = i + 1; j < side.length; j++) partners.add(pairKey(side[i]!, side[j]!));
  }
  const { matches, resting } = meleeSides(ids, size, rng, partners, (id) => byeCount(state, id));
  const round = newRound(tx, ctx, "main", "melee", number, "drawn");
  matches.forEach(([a, b], i) => newMatch(tx, ctx, round, i + 1, a, b));
  resting.forEach((id, i) => newMatch(tx, ctx, round, matches.length + i + 1, [id], []));
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/** Draws the next round of a bracket according to the tournament format. */
export function drawNext(tx: Transaction, ctx: DrawContext, bracket: Bracket): void {
  const state = tx.state;
  const cfg = state.tournament.config;
  if (bracket === "consolation") {
    if (!cfg.consolation.enabled || cfg.format === "swiss" || cfg.format === "round_robin" || cfg.format === "melee_rotation") fail("NOTHING_TO_DRAW");
    return drawElimination(tx, ctx, "consolation", "elimination", () => consolationEntrants(tx.state), { avoidSameClub: false, seeding: false });
  }
  switch (cfg.format) {
    case "single_elimination":
      return drawElimination(tx, ctx, "main", "elimination", () => eligibleTeams(tx.state).map(toPairing), {
        avoidSameClub: cfg.draw.avoidSameClubFirstRound,
        seeding: cfg.draw.seeding,
      });
    case "pools_then_bracket":
      if (roundsOf(state, "main", "pool").length === 0) return drawPools(tx, ctx);
      if (roundsOf(state, "main", "final").length) fail("ROUND_ALREADY_DRAWN");
      return drawFinalPhase(tx, ctx);
    case "swiss":
      return drawSwiss(tx, ctx);
    case "round_robin":
      return drawLeague(tx, ctx);
    case "melee_rotation":
      return drawMelee(tx, ctx);
  }
}

/** True when the organizer (or the automation) can draw the next round now. */
export function canDrawNext(state: EngineState, bracket: Bracket): boolean {
  const cfg = state.tournament.config;
  if (bracket === "consolation") {
    if (!cfg.consolation.enabled || !["single_elimination", "pools_then_bracket"].includes(cfg.format)) return false;
    const rounds = roundsOf(state, "consolation", "elimination");
    if (rounds.length === 0) {
      try {
        return consolationEntrants(state).length >= 2;
      } catch {
        return false;
      }
    }
    if (cfg.bracketMode === "fixed") return false;
    const last = rounds[rounds.length - 1]!;
    return isRoundComplete(state, last.id) && matchesOfRound(state, last.id).flatMap(winnerTeams).filter(stillIn(state)).length >= 2;
  }
  switch (cfg.format) {
    case "single_elimination": {
      const rounds = roundsOf(state, "main", "elimination");
      if (rounds.length === 0) return eligibleTeams(state).length >= 2;
      if (cfg.bracketMode === "fixed") return false;
      const last = rounds[rounds.length - 1]!;
      return isRoundComplete(state, last.id) && matchesOfRound(state, last.id).flatMap(winnerTeams).filter(stillIn(state)).length >= 2;
    }
    case "pools_then_bracket": {
      if (roundsOf(state, "main", "pool").length === 0) return eligibleTeams(state).length >= 3;
      if (roundsOf(state, "main", "final").length) return false;
      const labels = poolLabels(state);
      // A final needs two qualifiers still in: otherwise the pool winner wins.
      return labels.length > 0 && labels.every((l) => isPoolComplete(state, l)) && qualifiers(state).filter((x) => stillIn(state)(x.id)).length >= 2;
    }
    case "round_robin":
      return roundsOf(state, "main", "league").length === 0 && eligibleTeams(state).length >= 2;
    case "swiss":
    case "melee_rotation": {
      const phase = cfg.format === "swiss" ? "swiss" : "melee";
      const rounds = roundsOf(state, "main", phase);
      const ids = participants(state, phase);
      const last = rounds[rounds.length - 1];
      if (last && !isRoundComplete(state, last.id)) return false;
      return rounds.length < totalRounds(state, phase, ids.length) && ids.length >= (phase === "melee" ? state.rules.teamSize * 2 : 2);
    }
  }
}

/** Draws that happen on their own once the previous round is over (never the first one). */
export function autoAdvance(tx: Transaction, ctx: DrawContext): void {
  const cfg = tx.state.tournament.config;
  for (let guard = 0; guard < 6; guard++) {
    let drew = false;
    const mainStarted = Object.values(tx.state.rounds).some((r) => r.bracket === "main");
    if (cfg.autoNextRound && mainStarted && canDrawNext(tx.state, "main")) {
      drawNext(tx, { ...ctx, seed: `${ctx.seed}:auto${guard}` }, "main");
      drew = true;
    }
    // The consolation bracket follows the main one automatically.
    if (canDrawNext(tx.state, "consolation") && (cfg.autoNextRound || roundsOf(tx.state, "consolation").length === 0)) {
      drawNext(tx, { ...ctx, seed: `${ctx.seed}:autoc${guard}` }, "consolation");
      drew = true;
    }
    if (!drew) return;
  }
}

/** Updates round statuses after results changed. */
export function refreshRounds(tx: Transaction): void {
  for (const r of Object.values(tx.state.rounds)) {
    const ms = matchesOfRound(tx.state, r.id);
    if (ms.length === 0) continue;
    const complete = ms.every(isFinished);
    if (complete && r.status !== "finished") tx.update("round", r.id, { status: "finished" });
    else if (!complete && r.status === "finished") tx.update("round", r.id, { status: "drawn" });
  }
}

/** Progression after a match result was set or changed. */
export function afterResult(tx: Transaction, ctx: EngineContext, matchId: string): void {
  const m = tx.state.matches[matchId];
  if (!m) return;
  const round = tx.state.rounds[m.roundId]!;
  if (isFixedTree(tx.state, round) && isFinished(m)) propagateFixed(tx, m.id, ctx);
  if (round.phase === "pool" && m.pool) gslProgress(tx, ctx, m.pool);
}

/** Every match decided after `m` that involves one of `teams` (other phases, later rounds). */
export function laterMatchesWith(state: EngineState, m: Match, teams: string[]): Match[] {
  const round = state.rounds[m.roundId]!;
  const set = new Set(teams);
  return Object.values(state.matches).filter((x) => {
    if (x.id === m.id) return false;
    const r = state.rounds[x.roundId]!;
    if (compareRounds(r, round) <= 0) return false;
    // The parent chain of a fixed tree is handled by propagation.
    if (isFixedTree(state, round) && r.bracket === round.bracket && r.phase === round.phase) return false;
    // Round-robin pools: every pool match exists from the start.
    if (round.phase === "pool" && r.phase === "pool" && !isGslPool(state, m.pool ?? "")) return false;
    if (["swiss", "league", "melee"].includes(round.phase)) return false;
    return [...x.sideA, ...x.sideB].some((id) => set.has(id));
  });
}

const UNPLAYED: ReadonlySet<Match["status"]> = new Set(["pending", "waiting_venue", "ready"]);

/**
 * Applies a change of winner to what came after: in later, unplayed matches
 * the old winner and the old loser swap places (next round, consolation…).
 */
export function swapInLaterMatches(tx: Transaction, m: Match, oldWinners: string[], oldLosers: string[]): void {
  if (oldWinners.length !== oldLosers.length) return;
  const later = laterMatchesWith(tx.state, m, [...oldWinners, ...oldLosers]);
  const played = later.find((x) => !UNPLAYED.has(x.status) && !isWalkover(x));
  if (played) fail("NEXT_MATCH_PLAYED", { match: played.position });
  const map = new Map<string, string>();
  oldWinners.forEach((w, i) => {
    map.set(w, oldLosers[i]!);
    map.set(oldLosers[i]!, w);
  });
  for (const x of later) {
    tx.update("match", x.id, {
      sideA: x.sideA.map((id) => map.get(id) ?? id),
      sideB: x.sideB.map((id) => map.get(id) ?? id),
    });
  }
}

/**
 * A correction to or from « forfait des deux équipes » changes how many teams
 * go through: nothing can be swapped. Refused while what came after already
 * used the old result (next round of a new-draw bracket, consolation, other
 * phase). A fixed tree is handled by its own propagation.
 */
export function assertNothingDrawnAfter(state: EngineState, m: Match): void {
  const round = state.rounds[m.roundId]!;
  const nextRoundDrawn =
    round.phase === "elimination" &&
    !isFixedTree(state, round) &&
    Object.values(state.rounds).some((r) => r.bracket === round.bracket && r.phase === round.phase && r.number > round.number);
  if (nextRoundDrawn || laterMatchesWith(state, m, [...m.sideA, ...m.sideB]).length) fail("NEXT_ROUND_DRAWN");
}

export function qualificationSnapshot(state: EngineState): string {
  if (state.tournament.config.format !== "pools_then_bracket") return "";
  return qualifiers(state)
    .map((q) => `${q.pool}${q.place}:${q.id}`)
    .join(",");
}

export { unpropagateFixed, hasResult, lastRound, eliminationRanking, deleteRound };
