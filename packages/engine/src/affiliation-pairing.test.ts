import { describe, expect, it } from "vitest";
import { matchesOfRound, roundsOf, teamAffiliation } from "./queries";
import { exec, makeState, resetOps } from "./test-helpers";

const AGDE = { number: "0340901", name: "BOULE DU CAP AGDE" };
const SETE = { number: "0340815", name: "PÉTANQUE SÉTOISE" };
const p = (lastName: string, club: { number: string; name: string }) => ({ firstName: "Jean", lastName, club });

describe("N.H. edge cases and same-club avoidance (M7)", () => {
  it("number + name-only + another number of the same name: N.H. (two different numbers)", () => {
    resetOps();
    const s = exec(makeState({ teams: 0, teamFormat: "triplette" }), {
      type: "team.create",
      players: [p("A", AGDE), p("B", { number: "", name: "Boule du Cap Agde" }), p("C", { number: "0340999", name: "BOULE DU CAP AGDE" })],
    });
    const team = Object.values(s.teams)[0]!;
    expect(teamAffiliation(s, team.id)).toEqual({ kind: "nh" });
    expect(team.club).toBeNull();
  });

  it("same club typed differently (name only, lower case) is still avoided by the draw", () => {
    resetOps();
    let s = makeState({ teams: 0 });
    s = exec(s, { type: "team.create", players: [p("A1", AGDE), p("A2", AGDE)], checkIn: true });
    s = exec(s, { type: "team.create", players: [p("B1", { number: "", name: "boule du cap agde" }), p("B2", AGDE)], checkIn: true });
    s = exec(s, { type: "team.create", players: [p("C1", SETE), p("C2", SETE)], checkIn: true });
    s = exec(s, { type: "team.create", players: [p("D1", SETE), p("D2", SETE)], checkIn: true });
    const clubs = Object.values(s.teams).map((t) => t.club);
    expect(new Set(clubs).size).toBe(2);
    for (let k = 0; k < 20; k++) {
      const d = exec(s, { type: "round.draw", bracket: "main", seed: `case-${k}` });
      for (const m of matchesOfRound(d, roundsOf(d, "main")[0]!.id)) {
        const [a, b] = [...m.sideA, ...m.sideB].map((t) => d.teams[t]!.club);
        expect(a).not.toBe(b);
      }
    }
  });
});
