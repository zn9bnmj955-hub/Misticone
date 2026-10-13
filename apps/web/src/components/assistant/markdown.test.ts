import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref } from "./markdown";

const ORIGIN = "https://orgasport.fr";

describe("assistant markdown", () => {
  it("splits paragraphs on blank lines and keeps line breaks", () => {
    expect(parseMarkdown("Ligne 1\nLigne 2\n\nAutre")).toEqual([
      { kind: "p", lines: [[{ kind: "text", text: "Ligne 1" }], [{ kind: "text", text: "Ligne 2" }]] },
      { kind: "p", lines: [[{ kind: "text", text: "Autre" }]] },
    ]);
  });

  it("reads bold, bullet and numbered lists, headings as bold lines", () => {
    const blocks = parseMarkdown("## Règle\n- **Cible** : 13 points\n* deux\n1. un\n2) deux");
    expect(blocks[0]).toEqual({ kind: "p", lines: [[{ kind: "strong", children: [{ kind: "text", text: "Règle" }] }]] });
    expect(blocks[1]).toEqual({
      kind: "ul",
      items: [
        [{ kind: "strong", children: [{ kind: "text", text: "Cible" }] }, { kind: "text", text: " : 13 points" }],
        [{ kind: "text", text: "deux" }],
      ],
    });
    expect(blocks[2]).toEqual({ kind: "ol", items: [[{ kind: "text", text: "un" }], [{ kind: "text", text: "deux" }]] });
  });

  it("only links to http(s) or same-site paths", () => {
    expect(safeHref("/c/7KQ2")).toEqual({ href: "/c/7KQ2", external: false });
    expect(safeHref("https://www.ffpjp.com/regles")).toEqual({ href: "https://www.ffpjp.com/regles", external: true });
    expect(safeHref("https://orgasport.fr/concours?x=1", ORIGIN)).toEqual({ href: "/concours?x=1", external: false });
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "//evil.example", "/\\evil", "mailto:a@b.fr", "vbscript:x"])
      expect(safeHref(bad)).toBeNull();
    expect(parseInline("[clic](javascript:alert(1))")).toEqual([{ kind: "text", text: "[clic](javascript:alert(1))" }]);
    expect(parseInline("[clic](data:x)")).toEqual([{ kind: "text", text: "clic" }]);
  });

  it("links bare URLs without their trailing punctuation", () => {
    expect(parseInline("Voir https://orgasport.fr/c/7KQ2.", ORIGIN)).toEqual([
      { kind: "text", text: "Voir " },
      { kind: "link", href: "/c/7KQ2", external: false, children: [{ kind: "text", text: "https://orgasport.fr/c/7KQ2" }] },
      { kind: "text", text: "." },
    ]);
    expect(parseInline("[la page](/c/7KQ2) et **[gras](https://a.fr)**")).toEqual([
      { kind: "link", href: "/c/7KQ2", external: false, children: [{ kind: "text", text: "la page" }] },
      { kind: "text", text: " et " },
      { kind: "strong", children: [{ kind: "link", href: "https://a.fr/", external: true, children: [{ kind: "text", text: "gras" }] }] },
    ]);
  });

  it("keeps HTML as plain text and leaves an unfinished ** as is (streaming)", () => {
    expect(parseInline('<img src=x onerror="alert(1)">')).toEqual([{ kind: "text", text: '<img src=x onerror="alert(1)">' }]);
    expect(parseInline("Le **but")).toEqual([{ kind: "text", text: "Le **but" }]);
  });
});
