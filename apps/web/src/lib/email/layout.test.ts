import { describe, expect, it } from "vitest";
import { lightPalette, renderEmail } from "./layout";

describe("lightPalette", () => {
  it("reads the light-mode design tokens, not the dark ones", () => {
    const css = ":root{--os-bg:#111;--os-ink:#222;--os-accent:#333;color-scheme:light}:root[data-theme=dark]{--os-bg:#999}";
    const p = lightPalette(css);
    expect(p).toMatchObject({ bg: "#111", ink: "#222", accent: "#333" });
    expect(p.line).toBe("inherit");
  });

  it("finds every color used by emails in the real token file", () => {
    for (const value of Object.values(lightPalette())) expect(value).not.toBe("inherit");
  });
});

describe("renderEmail", () => {
  const palette = lightPalette();
  const { html, text } = renderEmail(
    {
      brand: "OrgaSport",
      title: "Bonjour",
      preheader: "Résumé",
      blocks: [
        { kind: "paragraph", text: "<b>Texte</b>" },
        { kind: "button", label: "Ouvrir", url: "https://exemple.fr/a?b=1&c=2" },
        { kind: "links", items: [{ label: "Piège", url: "javascript:alert(1)" }] },
        { kind: "codes", items: [{ label: "Bénévole 1", value: "504312" }] },
      ],
      footer: ["Pied"],
    },
    palette,
  );

  it("escapes text and refuses non-web links", () => {
    expect(html).toContain("&lt;b&gt;Texte&lt;/b&gt;");
    expect(html).toContain('href="https://exemple.fr/a?b=1&amp;c=2"');
    expect(html).not.toContain('href="javascript:');
  });

  it("uses the token colors", () => {
    expect(html).toContain(`background:${palette.accent}`);
  });

  it("has a plain-text twin", () => {
    expect(text).toContain("Bonjour");
    expect(text).toContain("Ouvrir : https://exemple.fr/a?b=1&c=2");
    expect(text).toContain("Bénévole 1 : 504312");
    expect(text).toContain("Pied");
  });
});
