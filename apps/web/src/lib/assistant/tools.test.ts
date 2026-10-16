import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({}) }));
vi.mock("@/lib/data/catalog", () => ({ listCatalog: async () => [], toCatalogQuery: () => ({}) }));
vi.mock("@/lib/data/tournaments", () => ({ getMyNextMatch: async () => null }));
vi.mock("@/lib/tournament/load", () => ({ loadTournament: async () => null }));

const { runTool, toolDefinitions } = await import("./tools");
const { systemPrompt } = await import("./prompt");

const ctx = { viewer: null, origin: null, nowMs: Date.parse("2026-10-16T08:00:00Z"), siteUrl: "http://localhost" };

describe("assistant: no end time, no duration", () => {
  it("format_advice gives counts only", async () => {
    const res = await runTool("format_advice", { sport: "petanque", teams: 128, venues: 10, start_time: "14:00" }, ctx);
    expect(res.isError).toBe(false);
    const out = JSON.parse(res.content) as Record<string, unknown>;
    expect(out.venues_needed_first_round).toBeGreaterThan(10);
    expect(out).not.toHaveProperty("estimated_end");
    expect(res.content).not.toMatch(/end|fin|dur/i);
  });

  it("tells the model never to give an end time", () => {
    expect(systemPrompt()).toContain("Ne donne jamais d'heure de fin");
    const advice = toolDefinitions().find((t) => t.name === "format_advice");
    expect(advice?.description).not.toMatch(/heure de fin estimée/);
  });
});
