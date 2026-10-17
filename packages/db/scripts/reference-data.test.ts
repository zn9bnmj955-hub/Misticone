import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRICING_PLANS } from "./reference-data";

// The plan description is shown to the club right above the "Pay" button.
describe("pricing plans", () => {
  it("describe what the club buys, never an internal note", () => {
    for (const plan of PRICING_PLANS) {
      expect(plan.description).not.toMatch(/prix de départ|à fixer|administration|todo/i);
      expect(plan.description.length).toBeGreaterThan(20);
    }
  });

  it("are the same in the generated reference.sql and seed.sql", () => {
    for (const file of ["reference.sql", "seed.sql"]) {
      const sql = readFileSync(new URL(`../../../supabase/${file}`, import.meta.url), "utf8");
      expect(sql).not.toMatch(/Prix de départ/);
      for (const plan of PRICING_PLANS) expect(sql).toContain(plan.description.replace(/'/g, "''"));
    }
  });
});

// A2: the assistant's knowledge base covers each feature of the site and
// summarises the official rules with their source and dates.
describe("knowledge base", async () => {
  const { KB_DOCS } = await import("./kb-content");
  const { enabledSports } = await import("@orgasport/sports");

  it("has a help sheet for each feature asked by the owner", () => {
    const all = KB_DOCS.map((d) => `${d.title}\n${d.body}`).join("\n");
    for (const topic of [/PIN/, /cadrage/i, /Office/, /N\.H\./, /concours B/, /concours C/, /2 jours/, /Clore définitivement/, /14 jours/]) {
      expect(all).toMatch(topic);
    }
    expect(KB_DOCS.filter((d) => d.kind === "help").map((d) => d.title)).toEqual(
      expect.arrayContaining([expect.stringMatching(/PIN/), expect.stringMatching(/cadrage/), expect.stringMatching(/N\.H\./)]),
    );
  });

  it("keeps the promise of the registration form: contacts kept 6 months at most", () => {
    const closing = KB_DOCS.find((d) => /suppression des résultats/.test(d.title));
    expect(closing?.body).toMatch(/14 jours/);
    expect(closing?.body).toMatch(/plus de 6 mois après le concours/);
  });

  it("dates every rulebook sheet and gives its source", () => {
    const rules = KB_DOCS.filter((d) => d.kind === "rules");
    expect(rules.length).toBeGreaterThan(0);
    for (const d of rules) {
      expect(d.source).toMatch(/^https:\/\//);
      expect(d.versionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("only has sheets for enabled sports, with unique titles, and never an end time", () => {
    const enabled = new Set(enabledSports().map((s) => s.slug));
    for (const d of KB_DOCS) if (d.sport) expect(enabled).toContain(d.sport);
    expect(new Set(KB_DOCS.map((d) => d.title)).size).toBe(KB_DOCS.length);
    for (const d of KB_DOCS) expect(d.body).not.toMatch(/heure de fin (estimée|prévue)|finit vers/i);
  });

  it("is in the generated reference.sql and seed.sql", () => {
    for (const file of ["reference.sql", "seed.sql"]) {
      const sql = readFileSync(new URL(`../../../supabase/${file}`, import.meta.url), "utf8");
      for (const d of KB_DOCS) expect(sql).toContain(d.title.replace(/'/g, "''"));
    }
  });
});
