import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { toRoster } = await import("./registrants");
type Row = Parameters<typeof toRoster>[1][number];

const row = (number: number, status: Row["status"], players: [string, string][], extra: Partial<Row> = {}): Row => ({
  number,
  name: null,
  club_name: null,
  status,
  players: players.map(([first_name, last_name], i) => ({ first_name, last_name, position: i + 1 })),
  ...extra,
});

describe("public roster", () => {
  const rows: Row[] = [
    row(3, "waitlist", [["Léa", "Martin"], ["Hugo", "Bernard"]]),
    row(2, "registered", [["Jean", "Dupont"], ["Marc", "Petit"]], { club_name: "  Boule Aubagnaise " }),
    row(4, "withdrawn", [["Paul", "Roux"], ["Eva", "Blanc"]]),
    row(1, "checked_in", [["Ana", "Lopez"], ["Kim", "Morel"]]),
    row(5, "waitlist", [["Zoé", "Faure"], ["Tom", "Garnier"]]),
    row(6, "forfeit", [], { name: "Les Pointeurs" }),
  ];

  it("lists registered teams first, then the waiting list, without withdrawn teams", () => {
    const r = toRoster("published", rows, "full");
    expect(r.teams.map((t) => t.number)).toEqual([1, 2, 6, 3, 5]);
    expect(r.active).toBe(3);
    expect(r.waitlist).toBe(2);
    expect(r.status).toBe("published");
  });

  it("applies the organizer's name display rule", () => {
    expect(toRoster("live", rows, "full").teams[1]).toEqual({ number: 2, label: "Dupont / Petit", club: "Boule Aubagnaise", status: "registered" });
    expect(toRoster("live", rows, "initials").teams[1]!.label).toBe("J. D. / M. P.");
    expect(toRoster("live", rows, "initials").teams[2]!.label).toBe("Les Pointeurs");
  });

  it("orders players by position", () => {
    const shuffled = row(7, "registered", []);
    shuffled.players = [
      { first_name: "B", last_name: "Second", position: 2 },
      { first_name: "A", last_name: "First", position: 1 },
    ];
    expect(toRoster("published", [shuffled], "full").teams[0]!.label).toBe("First / Second");
  });

  it("never carries private fields", () => {
    const leaky = { ...row(8, "registered", [["Jean", "Dupont"]]), contact_email: "x@y.fr", license: "123" } as Row;
    (leaky.players[0] as Record<string, unknown>).license_number = "0912345";
    const json = JSON.stringify(toRoster("published", [leaky], "full"));
    expect(json).not.toContain("x@y.fr");
    expect(json).not.toContain("0912345");
    expect(json).not.toContain("Jean");
  });
});
