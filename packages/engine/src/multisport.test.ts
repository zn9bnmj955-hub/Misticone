import { describe, expect, it } from "vitest";
import { requireSport, type SportConfigInput } from "@orgasport/sports";
import { makeState, playToEnd, resetOps } from "./test-helpers";

const petanque = requireSport("petanque");

/**
 * Adding a sport must not require any change in the engine: a new
 * configuration is enough.
 */
const darts: SportConfigInput = {
  ...petanque,
  slug: "flechettes",
  name: "Fléchettes",
  icon: "darts",
  accentToken: "flechettes",
  venue: { kind: "target", noun: { singular: "cible", plural: "cibles" }, usage: "parallel" },
  teamFormats: [{ id: "solo", label: "Individuel", players: 1, substitutes: { min: 0, max: 0 } }],
  scoring: { mode: "sets", setsToWin: 3, pointsPerSet: 501, allowDraw: false },
  typicalMatchMinutes: 20,
  changeoverMinutes: 2,
  defaults: { ...petanque.defaults, teamFormat: "solo", venues: 8, poolSystem: "round_robin" },
};

const tableTennis: SportConfigInput = {
  ...darts,
  slug: "tennis-de-table",
  name: "Tennis de table",
  icon: "table",
  accentToken: "tennis-de-table",
  venue: { kind: "table", noun: { singular: "table", plural: "tables" }, usage: "parallel" },
  scoring: { mode: "sets", setsToWin: 3, pointsPerSet: 11, allowDraw: false },
};

describe("new sports are pure configuration", () => {
  it("darts: elimination with consolation, best of 5 sets", () => {
    resetOps();
    const s = playToEnd(makeState({ teams: 19, sportConfig: darts, venues: 8 }), "darts");
    expect(s.tournament.status).toBe("finished");
    const scored = Object.values(s.matches).filter((m) => m.status === "done");
    expect(scored.every((m) => Math.max(m.scoreA!, m.scoreB!) === 3)).toBe(true);
  });
  it("table tennis: pools then knockout", () => {
    resetOps();
    const s = playToEnd(makeState({ teams: 12, sportConfig: tableTennis, venues: 4, config: { format: "pools_then_bracket" } }), "tt");
    expect(s.tournament.status).toBe("finished");
  });
});
