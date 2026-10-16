import { describe, expect, it } from "vitest";
import { renderPurgedPage } from "./render";

/** B3: 14 days after the final, /c/CODE only says « Résultats supprimés ». */
const meta = { short_code: "PRG2", name: "Concours purgé", starts_at: "2026-09-12T12:00:00Z", state_version: 42 };

describe("renderPurgedPage", () => {
  it("shows « Résultats supprimés », the name and the code, and nothing else of the tournament", () => {
    const page = renderPurgedPage(meta, { fragment: false });
    expect(page).toContain("Résultats supprimés");
    expect(page).toContain("Concours purgé");
    expect(page).toContain("PRG2");
    expect(page).not.toContain("<script src");
    expect(page).not.toContain("data-ws");
    expect(Buffer.byteLength(page)).toBeLessThan(100_000);
  });

  it("gives a page left open the same message on its next refresh (fragment)", () => {
    const frag = renderPurgedPage(meta, { fragment: true });
    expect(frag.startsWith('<div id="live" data-version="42">')).toBe(true);
    expect(frag).toContain("Résultats supprimés");
    expect(frag).not.toContain("<html");
  });

  it("escapes the tournament name", () => {
    expect(renderPurgedPage({ ...meta, name: "<b>x</b>" }, { fragment: false })).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
