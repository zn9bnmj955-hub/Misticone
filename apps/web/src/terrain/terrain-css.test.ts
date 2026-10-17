import { describe, expect, it } from "vitest";
import { TERRAIN_CSS } from "./styles.generated";

/**
 * T4 — old computers (Firefox ESR 52, Chrome 49) and old phones: static check of the
 * terrain page CSS. Flexbox without « gap » and tables only; no grid, no newer syntax
 * that would hide whole blocks on an old browser.
 */
describe("terrain CSS for old browsers", () => {
  const rules = TERRAIN_CSS.replace(/@media[^{]*\{/g, "");

  it("uses no CSS grid and no gap (flexbox gap: Safari < 14.1, Chrome < 84)", () => {
    expect(rules).not.toMatch(/display:\s*(inline-)?grid/);
    expect(rules).not.toMatch(/(^|[;{])\s*(row-|column-)?gap:/);
    expect(rules).not.toMatch(/grid-template|place-items|aspect-ratio|inset:|clamp\(|min\(|max\(|:is\(|:where\(|:has\(/);
  });

  it("prints the draw sheets like the federation result sheets: tables only, header repeated, rows kept whole", () => {
    const print = TERRAIN_CSS.slice(TERRAIN_CSS.indexOf("@media print"));
    expect(print).toContain("thead{display:table-header-group}");
    expect(print).toMatch(/tr\{page-break-inside:avoid/);
    expect(print).toMatch(/\.find,\.tabs,\.foot,\.score-form,\.offline,\.no-print\{display:none!important\}/);
    expect(print).toMatch(/\.sheet-nav,\.save,\.dot\{display:none\}/);
  });
});
