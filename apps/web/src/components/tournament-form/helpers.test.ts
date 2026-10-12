import { describe, expect, it } from "vitest";
import { requireSport } from "@orgasport/sports";
import { defaultForm, type FormContext } from "@/lib/tournament-form";
import { categoryLabel, formatLabel, hm, longDate } from "./display";
import { fieldKey, issueMessage, issuesByField, orderedIssues, stepOfIssue, venueVars } from "./issues";
import { checkMediaFile, isMediaPathOf, mediaPath, sniffType, typeOfPath } from "./media";
import { eurosInput, parseEuros } from "./money";
import { safePlan, summarizePlan } from "./plan";
import { keepReserved, parseVenueNames, toggleReserved, venueNamesText, VENUE_NAME_MAX } from "./venue-names";

const ID = "6f1c2a4e-1b2c-4d5e-8f90-123456789abc";
const ctx: FormContext = {
  club: { name: "AS Test", address: "1 rue du Stade", postcode: "13400", city: "Aubagne", lat: 43.29, lng: 5.57, default_venue_count: 20 },
  person: { name: "Alex Martin", email: "alex@example.com" },
  nowMs: Date.parse("2026-10-12T10:00:00Z"),
};

describe("venue names", () => {
  it("reads one name per line, trimmed, blank lines dropped, cut to the maximum", () => {
    expect(parseVenueNames(" A \n\n  B\r\nTerrain d'honneur \n   ")).toEqual(["A", "B", "Terrain d'honneur"]);
    expect(parseVenueNames("x".repeat(VENUE_NAME_MAX + 10))[0]).toHaveLength(VENUE_NAME_MAX);
    expect(parseVenueNames("")).toEqual([]);
    expect(venueNamesText(["1", "Honneur"])).toBe("1\nHonneur");
  });

  it("keeps only reserved venues that still exist, in the venue order", () => {
    expect(keepReserved(["3", "9", "1"], ["1", "2", "3", "4"])).toEqual(["1", "3"]);
    expect(toggleReserved(["1"], "4", ["1", "2", "3", "4"])).toEqual(["1", "4"]);
    expect(toggleReserved(["1", "4"], "1", ["1", "2", "3", "4"])).toEqual(["4"]);
  });
});

describe("entry fee", () => {
  it("reads euros the French way", () => {
    expect(parseEuros("")).toBe(0);
    expect(parseEuros("10")).toBe(1000);
    expect(parseEuros("10,50")).toBe(1050);
    expect(parseEuros("7.5 €")).toBe(750);
    expect(parseEuros("10,")).toBeNull();
    expect(parseEuros("-3")).toBeNull();
    expect(parseEuros("1000,01")).toBeNull();
  });

  it("shows cents back as typed", () => {
    expect(eurosInput(1000)).toBe("10");
    expect(eurosInput(1050)).toBe("10,50");
    expect(eurosInput(0)).toBe("0");
  });
});

describe("poster and rules files", () => {
  it("checks type and size before sending", () => {
    expect(checkMediaFile("poster", { type: "image/png", size: 1000 })).toBeNull();
    expect(checkMediaFile("poster", { type: "application/pdf", size: 1000 })).toBe("bad_type");
    expect(checkMediaFile("poster", { type: "image/jpeg", size: 6 * 1024 * 1024 })).toBe("too_big");
    expect(checkMediaFile("rules", { type: "application/pdf", size: 9 * 1024 * 1024 })).toBeNull();
    expect(checkMediaFile("rules", { type: "image/png", size: 10 })).toBe("bad_type");
  });

  it("builds paths inside the tournament folder and recognizes only those", () => {
    const poster = mediaPath(ID, "poster", "image/jpeg", 1760000000000);
    expect(poster).toBe(`${ID}/poster-1760000000000.jpg`);
    expect(isMediaPathOf(ID, "poster", poster)).toBe(true);
    expect(isMediaPathOf(ID, "rules", poster)).toBe(false);
    expect(isMediaPathOf("00000000-0000-0000-0000-000000000000", "poster", poster)).toBe(false);
    expect(isMediaPathOf(ID, "poster", `${ID}/../other/poster-1760000000000.jpg`)).toBe(false);
    expect(isMediaPathOf(ID, "rules", `${ID}/rules-1760000000000.pdf`)).toBe(true);
    expect(isMediaPathOf(ID, "rules", 42)).toBe(false);
    expect(typeOfPath(poster)).toBe("image/jpeg");
  });

  it("recognizes the real type from the first bytes", () => {
    expect(sniffType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(sniffType(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffType(new TextEncoder().encode("<html>"))).toBeNull();
  });
});

describe("validation messages", () => {
  const petanque = requireSport("petanque");

  it("attaches issues to fields and steps", () => {
    expect(fieldKey("organizer.email")).toBe("organizer.email");
    expect(fieldKey("coOrganizers.2")).toBe("coOrganizers");
    expect(stepOfIssue({ path: "venueLabels", code: "duplicate" })).toBe("venues");
    expect(stepOfIssue({ path: "organizer.name", code: "too_small" })).toBe("team");
    const first = issuesByField([
      { path: "name", code: "too_small" },
      { path: "name", code: "too_big" },
    ]);
    expect(first.get("name")?.code).toBe("too_small");
    expect(orderedIssues([{ path: "venueCount", code: "too_big" }, { path: "organizer.name", code: "too_small" }]).map((i) => i.path)).toEqual([
      "organizer.name",
      "venueCount",
    ]);
  });

  it("speaks with the sport's nouns", () => {
    const vars = venueVars(petanque);
    expect(issueMessage({ path: "reservedLabels", code: "all_reserved" }, vars)).toContain(petanque.venue.noun.singular);
    expect(issueMessage({ path: "date", code: "in_past" })).toBe("Cette date est déjà passée.");
    expect(issueMessage({ path: "unknownField", code: "whatever" })).toBe("Valeur à vérifier.");
  });
});

describe("display", () => {
  it("writes dates and times the French way", () => {
    expect(hm("14:30")).toBe("14 h 30");
    expect(hm("09:05")).toBe("9 h 05");
    expect(longDate("2026-10-24")).toBe("samedi 24 octobre 2026");
    expect(formatLabel("single_elimination")).toBe("Élimination directe");
    expect(categoryLabel("veterans")).toBe("Vétérans");
    expect(categoryLabel("unknown")).toBe("unknown");
  });
});

describe("venue plan", () => {
  it("counts the venues needed and the delayed games", () => {
    const sport = requireSport("petanque");
    const form = { ...defaultForm(sport, ctx), name: "Test", maxTeams: 64, venueCount: 20, format: "single_elimination" as const };
    const plan = safePlan(form, sport);
    expect(plan).not.toBeNull();
    const s = summarizePlan(form, sport, plan!);
    expect(s.needed).toBe(32);
    expect(s.free).toBe(20);
    expect(s.delayed).toBe(12);
    expect(s.endDate).toBe(form.date);
  });

  it("waits for a valid date and time", () => {
    const sport = requireSport("petanque");
    expect(safePlan({ ...defaultForm(sport, ctx), date: "2026-1" }, sport)).toBeNull();
  });

  it("counts time slots for sports that share their venues", () => {
    const sport = requireSport("football");
    const form = { ...defaultForm(sport, ctx), maxTeams: 8, venueCount: 2 };
    const plan = safePlan(form, sport);
    expect(plan).not.toBeNull();
    const s = summarizePlan(form, sport, plan!);
    expect(s.slots).toBeGreaterThan(1);
    expect(s.slot).toBeGreaterThan(0);
  });
});
