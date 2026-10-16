import { describe, expect, it } from "vitest";
import { qrTarget } from "@/lib/tournament/qr-target";
import { spacedPin, volunteerSheet } from "./volunteer-sheet";

describe("volunteer sheet (K2)", () => {
  const sheet = volunteerSheet({ code: "7KQ2", tournamentName: "Grand prix", label: "Table de marque", pin: "482193" });

  it("points the QR code to the scoring table of the right tournament", () => {
    expect(sheet.tablePath).toBe("/c/7KQ2/table");
    expect(sheet.qrSrc).toBe("/c/7KQ2/qr.svg?cible=table");
    expect(qrTarget("7KQ2", "table")).toMatch(/\/c\/7KQ2\/table$/);
    expect(qrTarget("7KQ2", null)).toMatch(/\/c\/7KQ2$/);
  });

  it("never puts the PIN in an address", () => {
    for (const url of [sheet.tablePath, sheet.qrSrc, qrTarget(sheet.code, "table")]) {
      expect(url).not.toContain(sheet.pin);
      expect(url).not.toMatch(/pin/i);
    }
  });

  it("shows the PIN in two groups of three digits", () => {
    expect(spacedPin("482193")).toBe("482 193");
    expect(spacedPin("0042")).toBe("0042");
  });
});

describe("single table PIN by default at payment (K2)", () => {
  it("a new tournament form gives exactly one volunteer PIN to the publication", async () => {
    const { requireSport } = await import("@orgasport/sports");
    const { buildPublication, defaultForm } = await import("@/lib/tournament-form");
    const { generatePins } = await import("@/lib/payments/pins");
    const sport = requireSport("petanque");
    const form = { ...defaultForm(sport, { club: { name: "AS Test" }, person: { name: "Alex" }, nowMs: Date.parse("2026-10-12T10:00:00Z") }), name: "Grand prix" };
    expect(form.pinCount).toBe(1);
    const pins = generatePins(form.pinCount);
    const pub = buildPublication(form, sport, { organizerUserId: "u1", pins, pinLabel: (n) => `Bénévole ${n}` });
    const withPin = pub.staff.filter((s) => s.pin);
    expect(withPin).toHaveLength(1);
    expect(withPin[0]!.pin).toMatch(/^\d{6}$/);
  });
});
