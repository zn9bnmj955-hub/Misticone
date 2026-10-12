import { describe, expect, it } from "vitest";
import { costMicroEur, DEFAULT_PRICES } from "./pricing";
import { SuggestionFilter } from "./suggestions";

describe("cost", () => {
  it("Haiku 5.5: 10 000 tokens in, 500 out ≈ 0,12 centime", () => {
    const micro = costMicroEur({ input_tokens: 10_000, output_tokens: 500 }, DEFAULT_PRICES["claude-haiku-5-5"]!, 0.92);
    // (10000*0.1 + 500*0.5)/1e6 $ = 0.00125 $ → 0.00115 € → 1150 µ€
    expect(micro).toBe(1150);
  });
  it("cache reads are cheaper than fresh input", () => {
    const p = DEFAULT_PRICES["claude-haiku-5-5"]!;
    const fresh = costMicroEur({ input_tokens: 10_000, output_tokens: 0 }, p, 1);
    const cached = costMicroEur({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 10_000 }, p, 1);
    expect(cached).toBeLessThan(fresh);
  });
});

describe("suggestions filter", () => {
  it("hides the tag even when split across deltas", () => {
    const f = new SuggestionFilter();
    let shown = "";
    for (const d of ["Le but se joue ", "en 13 points.", "\n<sugg", 'estions>["Et le jet du but ?", "Comment s', "'inscrire ?\"]</suggestions>"]) {
      shown += f.push(d);
    }
    const end = f.finish();
    shown += end.text;
    expect(shown).toBe("Le but se joue en 13 points.\n");
    expect(end.suggestions).toEqual(["Et le jet du but ?", "Comment s'inscrire ?"]);
  });
  it("keeps text that only looks like the start of a tag", () => {
    const f = new SuggestionFilter();
    const shown = f.push("a < b et <s") + f.push("ur place") + f.finish().text;
    expect(shown).toBe("a < b et <sur place");
  });
  it("ignores malformed suggestions", () => {
    const f = new SuggestionFilter();
    f.push("ok<suggestions>pas du json</suggestions>");
    expect(f.finish().suggestions).toEqual([]);
  });
});
