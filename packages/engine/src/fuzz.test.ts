import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Command } from "./commands";
import { EngineError } from "./errors";
import { ACTIVE_ON_VENUE, hasResult } from "./queries";
import { createRng } from "./rng";
import { exec, makeState, playToEnd, randomScore, resetOps, type TestConfig } from "./test-helpers";
import type { EngineState } from "./types";

/** Rules that must hold after any sequence of organizer actions. */
function checkInvariants(s: EngineState) {
  const perRound = new Map<string, Set<string>>();
  const activeVenues = new Map<string, string>();
  const activeTeams = new Map<string, string>();
  for (const m of Object.values(s.matches)) {
    const teams = [...m.sideA, ...m.sideB];
    const seen = perRound.get(m.roundId) ?? new Set();
    for (const t of teams) {
      expect(seen.has(t), `team ${t} twice in a round`).toBe(false);
      seen.add(t);
      expect(s.teams[t], "unknown team").toBeDefined();
    }
    perRound.set(m.roundId, seen);
    if (["waiting_venue", "ready", "playing"].includes(m.status)) {
      expect(m.sideA.length > 0 && m.sideB.length > 0, "playable match needs two sides").toBe(true);
    }
    if (hasResult(m) && m.status === "done") {
      expect(m.scoreA).not.toBeNull();
      expect(m.winner).not.toBeNull();
    }
    if (s.rules.venueUsage === "parallel" && ACTIVE_ON_VENUE.has(m.status)) {
      expect(m.venueId).not.toBeNull();
      expect(activeVenues.has(m.venueId!), "venue double-booked").toBe(false);
      activeVenues.set(m.venueId!, m.id);
      for (const t of teams) {
        expect(activeTeams.has(t), "team on two venues").toBe(false);
        activeTeams.set(t, m.id);
      }
    }
  }
}

type Scenario = { sport: string; teamFormat?: string; config: TestConfig };
const formats: Scenario[] = [
  { sport: "petanque", config: { format: "single_elimination", bracketMode: "fixed", consolation: { enabled: true, losersOfRound: 1 } } },
  { sport: "petanque", config: { format: "single_elimination", bracketMode: "redraw", consolation: { enabled: true, losersOfRound: 1 } } },
  { sport: "petanque", config: { format: "pools_then_bracket", consolation: { enabled: true, losersOfRound: 1 } } },
  { sport: "petanque", config: { format: "swiss", rounds: 4 } },
  { sport: "petanque", teamFormat: "tete-a-tete", config: { format: "melee_rotation", rounds: 3 } },
  { sport: "football", config: { format: "pools_then_bracket" } },
  { sport: "football", config: { format: "round_robin" } },
];

describe("random organizer sessions", () => {
  it("never break the tournament, and it can always be finished", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 24 }),
        fc.integer({ min: 2, max: 12 }),
        fc.constantFrom(...formats),
        fc.string(),
        fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 10, maxLength: 80 }),
        (teams, venues, scenario, seed, actions) => {
          resetOps();
          const rng = createRng(seed);
          let s = makeState({ teams, venues, clubs: (i) => `club-${i % 3}`, sport: scenario.sport, teamFormat: scenario.teamFormat, config: scenario.config });
          s = exec(s, { type: "round.draw", bracket: "main", seed });
          for (const roll of actions) {
            const matches = Object.values(s.matches);
            const playable = matches.filter((m) => ["waiting_venue", "ready", "playing"].includes(m.status));
            const finished = matches.filter(hasResult);
            let cmd: Command | null = null;
            const pick = <T>(list: T[]) => (list.length ? list[rng.int(list.length)]! : null);
            const knockout = (id: string) => ["elimination", "final"].includes(s.rounds[s.matches[id]!.roundId]!.phase);
            if (roll < 55) {
              const m = pick(playable);
              if (m) cmd = { type: "match.score", matchId: m.id, ...randomScore(s, () => rng.next(), knockout(m.id)) };
            } else if (roll < 70) {
              const m = pick(finished);
              if (m) cmd = { type: "match.score", matchId: m.id, ...randomScore(s, () => rng.next(), knockout(m.id)) };
            } else if (roll < 78) {
              const m = pick(finished);
              if (m) cmd = { type: "match.reopen", matchId: m.id };
            } else if (roll < 86) {
              const m = pick(playable);
              if (m) cmd = { type: "match.forfeit", matchId: m.id, side: rng.next() < 0.5 ? "A" : "B" };
            } else if (roll < 93) {
              const a = pick(playable);
              const b = pick(playable.filter((x) => a && x.roundId === a.roundId));
              if (a && b) cmd = { type: "match.swapTeams", a: { matchId: a.id, side: "A" }, b: { matchId: b.id, side: "B" } };
            } else {
              const v = pick(Object.values(s.venues));
              if (v) cmd = { type: "venue.update", venueId: v.id, available: !v.available };
            }
            if (!cmd) continue;
            try {
              s = exec(s, cmd);
            } catch (e) {
              // Refusals are fine (e.g. correcting a match whose next one was played).
              if (!(e instanceof EngineError)) throw e;
            }
            checkInvariants(s);
          }
          // Reopen every venue and play to the end (a finished tournament only accepts corrections).
          if (s.tournament.status !== "finished") for (const v of Object.values(s.venues)) if (!v.available) s = exec(s, { type: "venue.update", venueId: v.id, available: true });
          s = playToEnd(s, `${seed}-end`);
          checkInvariants(s);
          expect(s.tournament.status).toBe("finished");
        },
      ),
      { numRuns: Number(process.env.FUZZ_RUNS ?? 150) },
    );
  }, 120_000);
});
