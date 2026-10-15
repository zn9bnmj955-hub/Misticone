import { describe, expect, it } from "vitest";
import {
  SPORTS,
  competitionFormatsFor,
  formatTemplate,
  getSport,
  isValidLicenseNumber,
  requireSport,
  sportConfigSchema,
} from "./index";
import { petanque } from "./sports/petanque";

const s0 = () => requireSport("petanque");

describe("sport registry", () => {
  it("validates every built-in sport", () => {
    expect(SPORTS.length).toBeGreaterThanOrEqual(2);
    for (const s of SPORTS) expect(() => sportConfigSchema.parse(s)).not.toThrow();
  });

  it("keeps defaults consistent with the declared options", () => {
    for (const s of SPORTS) {
      expect(s.teamFormats.map((f) => f.id)).toContain(s.defaults.teamFormat);
      expect(s.competitionFormats).toContain(s.defaults.competitionFormat);
      expect(s.categories).toContain(s.defaults.category);
    }
  });

  it("keeps team formats inside the sport's competition formats", () => {
    for (const s of SPORTS) for (const f of s.teamFormats) {
      expect(competitionFormatsFor(s, f.id).length).toBeGreaterThan(0);
      for (const c of f.competitionFormats ?? []) expect(s.competitionFormats).toContain(c);
    }
    expect(competitionFormatsFor(s0(), s0().defaults.teamFormat)).toContain(s0().defaults.competitionFormat);
  });

  it("plays a drawn mêlée only as a mêlée, and registered teams never as one", () => {
    const sport = requireSport("petanque");
    for (const f of sport.teamFormats) {
      const formats = competitionFormatsFor(sport, f.id);
      if (f.individualRegistration) expect(formats).toEqual(["melee_rotation"]);
      else expect(formats).not.toContain("melee_rotation");
    }
  });

  it("finds sports by slug", () => {
    expect(getSport("petanque")?.name).toBe("Pétanque");
    expect(getSport("curling")).toBeUndefined();
    expect(() => requireSport("curling")).toThrow();
  });

  it("accepts a brand new sport without code changes", () => {
    const darts = sportConfigSchema.parse({
      ...petanque,
      slug: "flechettes",
      name: "Fléchettes",
      icon: "darts",
      accentToken: "flechettes",
      venue: { kind: "target", noun: { singular: "cible", plural: "cibles" }, usage: "parallel" },
      teamFormats: [{ id: "solo", label: "Individuel", players: 1, substitutes: { min: 0, max: 0 } }],
      scoring: { mode: "sets", setsToWin: 3, pointsPerSet: 501, allowDraw: false },
      defaults: { ...petanque.defaults, teamFormat: "solo", venues: 8 },
    });
    expect(darts.venue.noun.singular).toBe("cible");
  });
});

describe("license format", () => {
  const sport = requireSport("petanque");
  it("checks the format only", () => {
    expect(isValidLicenseNumber(sport, "01234567")).toBe(true);
    expect(isValidLicenseNumber(sport, " 0123456 ")).toBe(true);
    expect(isValidLicenseNumber(sport, "12AB")).toBe(false);
    expect(isValidLicenseNumber(sport, "")).toBe(false);
  });
});

describe("notification templates", () => {
  it("fills placeholders", () => {
    const sport = requireSport("petanque");
    expect(
      formatTemplate(sport.notifications.yourTurn, {
        venueLabel: "Terrain",
        venue: "12",
        time: "15 h 40",
        opponent: "l'équipe 27 (Dupont / Martin)",
      }),
    ).toBe("À vous ! Terrain 12 · 15 h 40 · contre l'équipe 27 (Dupont / Martin)");
  });
  it("leaves unknown placeholders", () => {
    expect(formatTemplate("{a} {b}", { a: 1 })).toBe("1 {b}");
  });
});
