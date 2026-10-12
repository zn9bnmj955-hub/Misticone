import { describe, expect, it } from "vitest";
import { SPORTS, getSport, requireSport } from "@orgasport/sports";
import {
  buildPublication,
  defaultForm,
  firstStepWithIssue,
  isoToParis,
  mergeDraft,
  nextSaturday,
  parisToIso,
  planFor,
  suggestFormat,
  switchSport,
  validateForm,
  venueLabelsOf,
  type FormContext,
} from "./index";

const NOW = Date.parse("2026-10-12T10:00:00Z");
const ctx: FormContext = {
  club: { name: "AS Test", address: "1 rue du Stade", postcode: "13400", city: "Aubagne", lat: 43.29, lng: 5.57, default_venue_count: 20 },
  person: { name: "Alex Martin", email: "alex@example.com" },
  nowMs: NOW,
};
const today = "2026-10-12";

describe("Paris time", () => {
  it("converts summer and winter times", () => {
    expect(parisToIso("2026-07-14", "14:30")).toBe("2026-07-14T12:30:00.000Z");
    expect(parisToIso("2026-12-05", "14:30")).toBe("2026-12-05T13:30:00.000Z");
    expect(isoToParis("2026-12-05T13:30:00.000Z")).toEqual({ date: "2026-12-05", time: "14:30" });
  });
  it("picks a Saturday at least a week ahead", () => {
    const d = nextSaturday(NOW);
    expect(new Date(`${d}T12:00:00Z`).getUTCDay()).toBe(6);
    expect(d >= "2026-10-19").toBe(true);
  });
});

describe("defaults", () => {
  it.each(SPORTS.map((s) => [s.slug]))("%s: defaults only need a name to be valid", (slug) => {
    const sport = requireSport(slug);
    const form = { ...defaultForm(sport, ctx), name: "Concours d'automne" };
    const res = validateForm(form, getSport, today);
    expect(res.ok ? [] : res.issues).toEqual([]);
  });

  it("uses the club's venues and address", () => {
    const form = defaultForm(requireSport("petanque"), ctx);
    expect(form.venueCount).toBe(20);
    expect(form.city).toBe("Aubagne");
    expect(form.organizer.email).toBe("alex@example.com");
    expect(form.registrationClosesTime < form.startTime).toBe(true);
  });

  it("switching sport keeps the organizer's text and resets sport choices", () => {
    const p = { ...defaultForm(requireSport("petanque"), ctx), name: "Fête du village", teamFormat: "triplette" };
    const f = switchSport(p, requireSport("football"), ctx);
    expect(f.name).toBe("Fête du village");
    expect(f.sportSlug).toBe("football");
    expect(requireSport("football").teamFormats.some((t) => t.id === f.teamFormat)).toBe(true);
    expect(validateForm(f, getSport, today).ok).toBe(true);
  });

  it("merges an old, incomplete draft without losing typed values", () => {
    const f = mergeDraft({ name: "Toussaint", teamFormat: "triplette", maxTeams: "abc", unknown: 1 }, requireSport("petanque"), ctx);
    expect(f.name).toBe("Toussaint");
    expect(f.teamFormat).toBe("triplette");
    expect(f.maxTeams).toBe(64);
    expect("unknown" in f).toBe(false);
  });
});

describe("validation", () => {
  const sport = requireSport("petanque");
  const base = { ...defaultForm(sport, ctx), name: "Concours" };

  it("rejects choices the sport does not offer", () => {
    const res = validateForm({ ...base, teamFormat: "foot-7", format: "round_robin", durationMinutes: 20 }, getSport, today);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["unknown_team_format", "not_applicable"]));
      expect(firstStepWithIssue(res.issues)).toBe("participants");
    }
  });

  it("rejects dates in the past and closings after the start", () => {
    const res = validateForm({ ...base, date: "2026-10-01", registrationClosesTime: "15:00" }, getSport, today);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(firstStepWithIssue(res.issues)).toBe("general");
  });

  it("checks venue names and reserved venues", () => {
    const bad = validateForm({ ...base, venueCount: 3, venueLabels: ["A", "A", "B"], reservedLabels: ["Z"] }, getSport, today);
    expect(bad.ok).toBe(false);
    const good = validateForm({ ...base, venueCount: 3, venueLabels: ["A", "B", "Honneur"], reservedLabels: ["Honneur"] }, getSport, today);
    expect(good.ok).toBe(true);
  });

  it("requires a number of rounds for swiss", () => {
    const res = validateForm({ ...base, format: "swiss", rounds: null }, getSport, today);
    expect(res.ok).toBe(false);
  });
});

describe("planning and publication", () => {
  it("64 teams on 20 venues: 32 needed, 12 delayed (the spec example)", () => {
    const sport = requireSport("petanque");
    const form = { ...defaultForm(sport, ctx), name: "Grand prix", maxTeams: 64, venueCount: 20, consolation: false };
    const plan = planFor(form, sport);
    expect(plan.firstRoundVenuesNeeded).toBe(32);
    expect(plan.firstRoundDelayed).toBe(12);
  });

  it("reserved venues are not counted for the first round", () => {
    const sport = requireSport("petanque");
    const form = { ...defaultForm(sport, ctx), name: "X", maxTeams: 32, venueCount: 17, venueLabels: [], reservedLabels: ["17"] };
    expect(planFor(form, sport).firstRoundDelayed).toBe(0);
  });

  it("builds columns, venues and staff for publish_tournament()", () => {
    const sport = requireSport("petanque");
    const form = {
      ...defaultForm(sport, ctx),
      name: "Grand prix",
      venueCount: 3,
      venueLabels: ["1", "2", "Honneur"],
      reservedLabels: ["Honneur"],
      coOrganizers: ["co@example.com"],
      autoDraw: true,
      timeLimitMinutes: 60,
    };
    const pub = buildPublication(form, sport, { organizerUserId: "u1", pins: ["123456"], pinLabel: (n) => `Bénévole ${n}` });
    expect(pub.fields.starts_at).toBe(parisToIso(form.date, form.startTime));
    expect(pub.venues).toEqual([
      { label: "1", position: 1, reserved: false },
      { label: "2", position: 2, reserved: false },
      { label: "Honneur", position: 3, reserved: true },
    ]);
    expect(pub.staff.map((s) => s.role)).toEqual(["organizer", "co_organizer", "co_organizer"]);
    expect(pub.staff[2]!.pin).toBe("123456");
    const config = pub.fields.config as { autoDrawAt: string; scoring: { timeLimitMinutes: number } };
    expect(config.autoDrawAt).toBe(pub.fields.starts_at);
    expect(config.scoring.timeLimitMinutes).toBe(60);
  });

  it("numbers venues when no names are given", () => {
    expect(venueLabelsOf({ venueCount: 3, venueLabels: [] })).toEqual(["1", "2", "3"]);
  });
});

describe("format advice", () => {
  it.each(SPORTS.map((s) => [s.slug]))("%s: only proposes formats the sport allows", (slug) => {
    const sport = requireSport(slug);
    for (const teams of [4, 8, 16, 32, 64, 128]) {
      const form = { ...defaultForm(sport, ctx), name: "Concours X", maxTeams: teams };
      const advice = suggestFormat(form, sport, teams);
      expect(sport.competitionFormats).toContain(advice.changes.format);
      const merged = { ...form, ...advice.changes };
      const res = validateForm(merged, getSport, today);
      expect(res.ok ? [] : res.issues).toEqual([]);
    }
  });

  it("asks for more venues when a big pétanque contest would end late", () => {
    const sport = requireSport("petanque");
    const form = { ...defaultForm(sport, ctx), name: "X", maxTeams: 128, venueCount: 10 };
    const advice = suggestFormat(form, sport, 128);
    expect(advice.reasons.map((r) => r.key)).toContain("moreVenues");
    expect(advice.changes.venueCount).toBeGreaterThan(10);
  });
});
