import { describe, expect, it } from "vitest";
import { isIsoDate, parseKbForm, staleRules } from "./forms";
import { errorText } from "./result";

const base = { title: "Pétanque : le but", sport: "petanque", sourceUrl: "", kind: "help", versionDate: "", reviewedAt: "", body: "Texte." };
const sports = ["petanque"];

describe("knowledge sheet form (A2)", () => {
  it("keeps a help sheet undated", () => {
    const res = parseKbForm(base, true, sports);
    expect(res).toEqual({
      ok: true,
      value: { title: "Pétanque : le but", sport_slug: "petanque", source_url: null, kind: "help", version_date: null, reviewed_at: null, body: "Texte.", published: true },
    });
  });

  it("needs the source, the version date and the review date for a rulebook sheet", () => {
    const res = parseKbForm({ ...base, kind: "rules" }, true, sports);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors).toEqual({ sourceUrl: "rulesSource", versionDate: "rulesDate", reviewedAt: "rulesDate" });
    for (const code of Object.values(res.errors)) expect(errorText(code)).toMatch(/règlement/);

    const ok = parseKbForm({ ...base, kind: "rules", sourceUrl: "https://www.ffpjp.org", versionDate: "2025-01-01", reviewedAt: "2026-10-16" }, true, sports);
    expect(ok.ok && ok.value).toMatchObject({ kind: "rules", source_url: "https://www.ffpjp.org", version_date: "2025-01-01", reviewed_at: "2026-10-16" });
  });

  it("refuses an unknown kind and impossible dates", () => {
    const res = parseKbForm({ ...base, kind: "blog", versionDate: "2026-02-30", reviewedAt: "16/10/2026" }, true, sports);
    expect(res.ok === false && res.errors).toEqual({ kind: "kind", versionDate: "date", reviewedAt: "date" });
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
  });
});

describe("rulebook review alert (12 months)", () => {
  const now = Date.parse("2026-10-16T10:00:00Z");
  const doc = (id: string, kind: string, reviewed_at: string | null) => ({ id, kind, reviewed_at });

  it("lists the rulebook sheets reviewed 12 months ago or more, or never", () => {
    const docs = [
      doc("fresh", "rules", "2026-01-01"),
      doc("eve", "rules", "2025-10-17"),
      doc("due", "rules", "2025-10-16"),
      doc("old", "rules", "2023-05-01"),
      doc("never", "rules", null),
      doc("help", "help", null),
    ];
    expect(staleRules(docs, now).map((d) => d.id)).toEqual(["due", "old", "never"]);
  });

  it("uses the Paris day", () => {
    // 15 October 2026, 23:30 in Paris is already the 16th.
    expect(staleRules([doc("due", "rules", "2025-10-16")], Date.parse("2026-10-15T22:30:00Z"))).toHaveLength(1);
    expect(staleRules([doc("due", "rules", "2025-10-16")], Date.parse("2026-10-15T21:30:00Z"))).toHaveLength(0);
  });
});
