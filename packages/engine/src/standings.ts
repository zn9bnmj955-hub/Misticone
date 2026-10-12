import { hash128 } from "./rng";
import { isFinished } from "./queries";
import type { EngineState, Match, RankingCriterion } from "./types";

export interface TeamStats {
  id: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  matchPoints: number;
}

export interface RankedTeam {
  id: string;
  rank: number;
  stats: TeamStats;
}

const empty = (id: string): TeamStats => ({
  id,
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  byes: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  diff: 0,
  matchPoints: 0,
});

/**
 * Per-team statistics over the given finished matches. A bye or a forfeit
 * win counts as a win with the configured forfeit score.
 */
export function computeStats(state: EngineState, teamIds: string[], matches: Match[]): Map<string, TeamStats> {
  const fs = state.tournament.config.forfeitScore;
  const mp = state.rules.matchPoints;
  const stats = new Map(teamIds.map((id) => [id, empty(id)]));
  const add = (id: string, f: (s: TeamStats) => void) => {
    const s = stats.get(id);
    if (s) f(s);
  };
  for (const m of matches) {
    if (!isFinished(m)) continue;
    if (m.status === "bye") {
      for (const id of m.sideA)
        add(id, (s) => {
          s.played++;
          s.wins++;
          s.byes++;
          s.pointsFor += fs.winner;
          s.pointsAgainst += fs.loser;
          s.matchPoints += mp.win;
        });
      continue;
    }
    const a = m.scoreA ?? (m.winner === "A" ? fs.winner : fs.loser);
    const b = m.scoreB ?? (m.winner === "B" ? fs.winner : fs.loser);
    const apply = (ids: string[], forPts: number, againstPts: number, result: "win" | "draw" | "loss") => {
      for (const id of ids)
        add(id, (s) => {
          s.played++;
          s.pointsFor += forPts;
          s.pointsAgainst += againstPts;
          if (result === "win") {
            s.wins++;
            s.matchPoints += mp.win;
          } else if (result === "draw") {
            s.draws++;
            s.matchPoints += mp.draw;
          } else {
            s.losses++;
            s.matchPoints += mp.loss;
          }
        });
    };
    const resA = m.winner === "A" ? "win" : m.winner === "draw" ? "draw" : "loss";
    const resB = m.winner === "B" ? "win" : m.winner === "draw" ? "draw" : "loss";
    apply(m.sideA, a, b, resA);
    apply(m.sideB, b, a, resB);
  }
  for (const s of stats.values()) s.diff = s.pointsFor - s.pointsAgainst;
  return stats;
}

function randomKey(seed: string, id: string): number {
  return hash128(`${seed}:${id}`)[0];
}

/**
 * Ranks teams by the criteria, in order. "head_to_head" only compares the
 * teams still tied at that point, on their matches against each other.
 * Teams equal on every criterion share the same rank.
 */
export function rankTeams(
  state: EngineState,
  teamIds: string[],
  matches: Match[],
  criteria: RankingCriterion[],
  seed = "ranking",
): RankedTeam[] {
  const stats = computeStats(state, teamIds, matches);
  const usesMatchPoints = criteria.includes("match_points");
  const number = (id: string) => state.teams[id]?.number ?? 0;

  const valueOf = (criterion: RankingCriterion, group: string[]): Map<string, number> => {
    const values = new Map<string, number>();
    if (criterion === "head_to_head") {
      const inGroup = new Set(group);
      const h2hMatches = matches.filter(
        (m) => m.status !== "bye" && [...m.sideA, ...m.sideB].every((id) => inGroup.has(id)),
      );
      const h2h = computeStats(state, group, h2hMatches);
      for (const id of group) values.set(id, usesMatchPoints ? h2h.get(id)!.matchPoints : h2h.get(id)!.wins);
      return values;
    }
    for (const id of group) {
      const s = stats.get(id)!;
      values.set(
        id,
        criterion === "wins"
          ? s.wins
          : criterion === "match_points"
            ? s.matchPoints
            : criterion === "point_diff"
              ? s.diff
              : criterion === "points_for"
                ? s.pointsFor
                : randomKey(seed, id),
      );
    }
    return values;
  };

  // Recursively split tied groups with the next criterion.
  const resolve = (group: string[], index: number): string[][] => {
    if (group.length <= 1 || index >= criteria.length) return [group.sort((a, b) => number(a) - number(b))];
    const values = valueOf(criteria[index]!, group);
    const sorted = [...group].sort((a, b) => values.get(b)! - values.get(a)!);
    const out: string[][] = [];
    let current: string[] = [];
    let last: number | undefined;
    for (const id of sorted) {
      const v = values.get(id)!;
      if (last !== undefined && v !== last) {
        out.push(...resolve(current, index + 1));
        current = [];
      }
      current.push(id);
      last = v;
    }
    out.push(...resolve(current, index + 1));
    return out;
  };

  const groups = resolve([...teamIds], 0);
  const ranked: RankedTeam[] = [];
  let rank = 1;
  for (const g of groups) {
    for (const id of g) ranked.push({ id, rank, stats: stats.get(id)! });
    rank += g.length;
  }
  return ranked;
}

/**
 * Elimination ranking: champion, finalist, then teams by the round in which
 * they lost (losers of the same round share a rank).
 */
export function eliminationRanking(state: EngineState, roundIds: string[]): RankedTeam[] {
  const rounds = roundIds.map((id) => state.rounds[id]!).sort((a, b) => a.number - b.number);
  const reached = new Map<string, number>();
  let champion: string | null = null;
  const matches: Match[] = [];
  rounds.forEach((r, idx) => {
    for (const m of Object.values(state.matches).filter((x) => x.roundId === r.id)) {
      matches.push(m);
      for (const id of [...m.sideA, ...m.sideB]) reached.set(id, Math.max(reached.get(id) ?? 0, idx + 1));
      if (idx === rounds.length - 1 && isFinished(m) && (m.winner === "A" || m.winner === "B")) {
        const lastRoundMatches = Object.values(state.matches).filter((x) => x.roundId === r.id);
        if (lastRoundMatches.length === 1) champion = (m.winner === "A" ? m.sideA : m.sideB)[0] ?? null;
      }
    }
  });
  const ids = [...reached.keys()];
  const stats = computeStats(state, ids, matches);
  const score = (id: string) => (id === champion ? 1000 : 0) + reached.get(id)! * 2;
  const sorted = ids.sort((a, b) => score(b) - score(a) || (state.teams[a]?.number ?? 0) - (state.teams[b]?.number ?? 0));
  const out: RankedTeam[] = [];
  sorted.forEach((id, i) => {
    const prev = out[i - 1];
    const rank = prev && score(sorted[i - 1]!) === score(id) ? prev.rank : i + 1;
    out.push({ id, rank, stats: stats.get(id)! });
  });
  return out;
}
