import { describe, expect, it } from "vitest";
import { requireSport } from "@orgasport/sports";
import { registrationWindow, teamShape, validateRegistration, type RegistrationMeta } from "./registration-rules";

const NOW = Date.parse("2026-10-20T10:00:00Z");
const meta = (m: Partial<RegistrationMeta> = {}): RegistrationMeta => ({
  status: "published",
  registration_mode: "both",
  registration_closes_at: "2026-10-24T11:45:00Z",
  max_teams: 4,
  waitlist_enabled: true,
  team_format: "doublette",
  eligibility: "open",
  category: "all",
  config: {},
  ...m,
});
const petanque = requireSport("petanque");

describe("registration window", () => {
  it("is open before the closing time while places remain", () => {
    expect(registrationWindow(meta(), 2, NOW)).toBe("open");
  });
  it("sends teams to the waiting list when full, or refuses without a list", () => {
    expect(registrationWindow(meta(), 4, NOW)).toBe("waitlist");
    expect(registrationWindow(meta({ waitlist_enabled: false }), 4, NOW)).toBe("full");
  });
  it("closes after the closing time, once started, or when only on site", () => {
    expect(registrationWindow(meta({ registration_closes_at: "2026-10-19T00:00:00Z" }), 0, NOW)).toBe("closed");
    expect(registrationWindow(meta({ status: "live" }), 0, NOW)).toBe("closed");
    expect(registrationWindow(meta({ registration_mode: "onsite" }), 0, NOW)).toBe("onsite_only");
  });
});

describe("team shape", () => {
  it("follows the team format and the eligibility", () => {
    expect(teamShape(meta(), petanque)).toMatchObject({ players: 2, substitutes: 0, individual: false, license: "hidden" });
    expect(teamShape(meta({ team_format: "triplette", config: { substitutes: 1 }, eligibility: "licensed" }), petanque)).toMatchObject({
      players: 3,
      substitutes: 1,
      license: "required",
    });
    expect(teamShape(meta({ team_format: "melee-doublette" }), petanque)).toMatchObject({ players: 1, individual: true });
  });
  it("never allows more substitutes than the sport", () => {
    expect(teamShape(meta({ team_format: "doublette", config: { substitutes: 5 } }), petanque).substitutes).toBe(0);
  });
});

describe("validation", () => {
  const ok = {
    players: [
      { firstName: "Léa", lastName: "Martin" },
      { firstName: "Paul", lastName: "Durand" },
    ],
    captain: { name: "Léa Martin", phone: "06 12 34 56 78" },
    acceptedRules: true,
  };
  it("accepts a complete team", () => {
    expect(validateRegistration(ok, teamShape(meta(), petanque), petanque)).toEqual([]);
  });
  it("needs a contact, the rules and the right number of players", () => {
    const issues = validateRegistration({ ...ok, players: ok.players.slice(0, 1), captain: { name: "Léa" }, acceptedRules: false }, teamShape(meta(), petanque), petanque);
    expect(issues.map((i) => i.code).sort()).toEqual(["contact", "count", "rules"]);
  });
  it("requires valid licenses for licensed-only tournaments", () => {
    const shape = teamShape(meta({ eligibility: "licensed" }), petanque);
    const issues = validateRegistration({ ...ok, players: [{ ...ok.players[0]!, license: "12" }, ok.players[1]!] }, shape, petanque);
    expect(issues).toEqual([
      { path: "players.0.license", code: "license" },
      { path: "players.1.license", code: "required" },
    ]);
  });
});
