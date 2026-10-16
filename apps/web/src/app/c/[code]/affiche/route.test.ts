import { beforeEach, describe, expect, it, vi } from "vitest";

let row: Record<string, unknown> | null = null;
vi.mock("@/lib/supabase/public", () => {
  const q = { select: () => q, eq: () => q, neq: () => q, maybeSingle: async () => ({ data: row }) };
  return { createPublicClient: () => ({ from: () => q }) };
});

const { GET } = await import("./route");

const poster = async () => {
  const res = await GET(new Request("http://localhost/c/GP3M/affiche"), { params: Promise.resolve({ code: "GP3M" }) });
  return res.text();
};
const tournament = (config: unknown) => ({
  name: "Grand Prix",
  sport_slug: "petanque",
  starts_at: "2026-11-14T13:00:00Z",
  address: "Place du Marché",
  postcode: "13000",
  city: "Marseille",
  team_format: "doublette",
  fee_cents: 1000,
  fee_per: "team",
  prize_text: null,
  eligibility: "open",
  config,
  clubs: { name: "Boule Club" },
});

describe("poster: concours B entry fee", () => {
  beforeEach(() => {
    row = null;
  });

  it("prints the B fee when teams sign up for the B", async () => {
    row = tournament({ consolation: { enabled: true, entry: "opt_in", feeCents: 500 } });
    const out = await poster();
    expect(out).toContain("Concours B : 5");
    expect(out).toContain("par équipe, sur place");
  });

  it("prints nothing for an automatic, free or disabled B, nor an old config", async () => {
    for (const config of [
      { consolation: { enabled: true, entry: "auto", feeCents: 500 } },
      { consolation: { enabled: true, entry: "opt_in", feeCents: 0 } },
      { consolation: { enabled: false, entry: "opt_in", feeCents: 500 } },
      { consolation: { enabled: true, losersOfRound: 1 } },
      null,
    ]) {
      row = tournament(config);
      const out = await poster();
      expect(out).toContain("Grand Prix");
      expect(out).not.toContain("Concours B");
    }
  });
});
