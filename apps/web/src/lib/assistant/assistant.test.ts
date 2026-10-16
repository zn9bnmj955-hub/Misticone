import { describe, expect, it } from "vitest";
import { costMicroEur, DEFAULT_PRICES } from "./pricing";
import { questionScope, systemPrompt } from "./prompt";
import { SuggestionFilter } from "./suggestions";
import { assistantUi } from "@/i18n/fr/assistantUi";

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

describe("scope: sport and the site are allowed", () => {
  it("a rules question is not refused", () => {
    expect(questionScope("Que dit le règlement quand le but sort du terrain ?")).toBe("in_scope");
    expect(questionScope("Un conseil pour mieux pointer ?")).toBe("in_scope");
  });
  it("« comment marche le PIN » is not refused", () => {
    expect(questionScope("Comment marche le PIN ?")).toBe("in_scope");
    expect(questionScope("Combien coûte un lien concours ?")).toBe("in_scope");
    expect(questionScope("Les résultats restent combien de temps ?")).toBe("in_scope");
  });
  it("an off-topic question is still refused, politely", () => {
    expect(questionScope("Pour qui voter à l'élection présidentielle ?")).toBe("off_topic");
    expect(questionScope("Écris-moi un programme en Python")).toBe("off_topic");
    expect(questionScope("Quel médicament contre la migraine ?")).toBe("off_topic");
    expect(assistantUi.offTopic).toMatch(/sport/);
    expect(assistantUi.offTopicSuggestions.length).toBeGreaterThan(0);
  });
  it("a short follow-up is left to the model", () => {
    expect(questionScope("Et pourquoi ?")).toBe("unclear");
  });
  it("the prompt names both domains, keeps official facts in the tools and never gives an end time", () => {
    const p = systemPrompt();
    for (const word of ["règlements", "conseils de jeu", "organisation d'un concours", "prix", "PIN", "cadrage", "concours B et C", "2 jours", "conservation des résultats"]) {
      expect(p).toContain(word);
    }
    expect(p).toMatch(/UNIQUEMENT des outils/);
    expect(p).toMatch(/Ne donne jamais d'heure de fin/);
    expect(p).toMatch(/refuse poliment/);
  });
  it("welcome questions cover the rules and the site", () => {
    expect(assistantUi.starters.some((s) => /règlement/i.test(s))).toBe(true);
    expect(assistantUi.starters.some((s) => /PIN/.test(s))).toBe(true);
  });
});
