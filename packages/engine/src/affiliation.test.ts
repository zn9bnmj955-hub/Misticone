import { describe, expect, it } from "vitest";
import { matchesOfRound, roundsOf, teamAffiliation } from "./queries";
import { exec, makeState, resetOps } from "./test-helpers";
import type { EngineState } from "./types";

const AGDE = { number: "0340901", name: "BOULE DU CAP AGDE" };
const SETE = { number: "0340815", name: "PÉTANQUE SÉTOISE" };
const p = (lastName: string, club?: { number: string; name: string } | null) => ({ firstName: "Jean", lastName, ...(club !== undefined && { club }) });

const created = (s: EngineState) => Object.values(s.teams).sort((a, b) => b.number - a.number)[0]!;

describe("teamAffiliation and N.H.", () => {
  it("3 players of the same club give that club, also on team.club", () => {
    resetOps();
    const s = exec(makeState({ teams: 0, teamFormat: "triplette" }), { type: "team.create", club: "Autre", players: [p("A", AGDE), p("B", AGDE), p("C", { number: " 0340901 ", name: "BOULE DU CAP AGDE" })] });
    const team = created(s);
    expect(teamAffiliation(s, team.id)).toEqual({ kind: "club", number: "0340901", name: "BOULE DU CAP AGDE" });
    expect(team.club).toBe("BOULE DU CAP AGDE");
    expect(Object.values(s.players).every((x) => x.club?.number === "0340901")).toBe(true);
  });

  it("2 different clubs give N.H. and no club on the team", () => {
    resetOps();
    const s = exec(makeState({ teams: 0 }), { type: "team.create", club: "Saisi", players: [p("A", AGDE), p("B", SETE)] });
    const team = created(s);
    expect(teamAffiliation(s, team.id)).toEqual({ kind: "nh" });
    expect(team.club).toBeNull();
  });

  it("without information, the club typed by hand is kept", () => {
    resetOps();
    let s = exec(makeState({ teams: 0 }), { type: "team.create", club: "Les Cigales", players: [p("A"), p("B", null)] });
    expect(teamAffiliation(s, created(s).id)).toEqual({ kind: "none" });
    expect(created(s).club).toBe("Les Cigales");
    // Only some players known: still the typed club.
    s = exec(s, { type: "team.create", club: "Les Cigales", players: [p("C", AGDE), p("D")] });
    expect(teamAffiliation(s, created(s).id)).toEqual({ kind: "none" });
    expect(created(s).club).toBe("Les Cigales");
  });

  it("team.update with new players' clubs recomputes the club (N.H. clears it)", () => {
    resetOps();
    let s = exec(makeState({ teams: 0 }), { type: "team.create", players: [p("A", AGDE), p("B", AGDE)] });
    const id = created(s).id;
    s = exec(s, { type: "team.update", teamId: id, players: [p("A", AGDE), p("B", SETE)] });
    expect(teamAffiliation(s, id).kind).toBe("nh");
    expect(s.teams[id]!.club).toBeNull();
  });

  it("same-club avoidance: N.H. teams carry no constraint, single-club teams avoid each other", () => {
    resetOps();
    let s = makeState({ teams: 0 });
    // 4 teams of AGDE, 4 N.H. teams (AGDE + SETE): with avoidance, AGDE never meets AGDE.
    for (let i = 0; i < 4; i++) s = exec(s, { type: "team.create", players: [p(`A${i}`, AGDE), p(`B${i}`, AGDE)], checkIn: true });
    for (let i = 0; i < 4; i++) s = exec(s, { type: "team.create", players: [p(`C${i}`, AGDE), p(`D${i}`, SETE)], checkIn: true });
    for (let k = 0; k < 20; k++) {
      const d = exec(s, { type: "round.draw", bracket: "main", seed: `nh-${k}` });
      const round = roundsOf(d, "main")[0]!;
      for (const m of matchesOfRound(d, round.id)) {
        const clubs = [...m.sideA, ...m.sideB].map((t) => d.teams[t]!.club);
        expect(clubs.filter((c) => c === "BOULE DU CAP AGDE").length).toBeLessThan(2);
      }
    }
    expect(Object.values(s.teams).filter((t) => t.club === null)).toHaveLength(4);
  });
});
