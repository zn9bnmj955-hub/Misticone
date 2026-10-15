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
