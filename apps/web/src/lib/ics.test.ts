import { describe, expect, it } from "vitest";
import { buildIcs, foldLine, icsDate, icsEscape } from "./ics";

describe("ics", () => {
  it("escapes special characters", () => {
    expect(icsEscape("Boulodrome, allée; 1\\2\nB")).toBe("Boulodrome\\, allée\; 1\\\\2\\nB");
  });
  it("formats UTC dates", () => {
    expect(icsDate("2026-10-24T12:30:00.000Z")).toBe("20261024T123000Z");
  });
  it("folds long lines at 75 octets, counting accents as 2 octets", () => {
    const folded = foldLine(`SUMMARY:${"é".repeat(60)}`);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").slice(1).every((l) => l.startsWith(" "))).toBe(true);
  });
  it("builds a complete event with CRLF line endings", () => {
    const ics = buildIcs({
      uid: "GP3M@orgasport",
      start: "2026-10-24T12:30:00Z",
      stamp: "2026-10-12T10:00:00Z",
      summary: "Grand Prix, doublettes",
      location: "Boulodrome, Aubagne",
      geo: { lat: 43.29, lng: 5.57 },
      url: "https://orgasport.fr/c/GP3M",
      description: "Organisé par AS Les Platanes",
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261024T123000Z\r\n");
    // The end of a competition cannot be predicted: start only.
    expect(ics).not.toContain("DTEND");
    expect(ics).not.toContain("DURATION");
    expect(ics).toContain("SUMMARY:Grand Prix\\, doublettes\r\n");
    expect(ics).toContain("GEO:43.290000;5.570000\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });
});
