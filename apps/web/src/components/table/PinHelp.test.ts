import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getMessages } from "@/i18n";
import { PinHelp } from "./PinHelp";

const t = getMessages().pinHelp;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");

describe("PinHelp", () => {
  it("explains the PIN to the organizer: no account, this tournament only, 24 h, phone, revocable", () => {
    const html = text(renderToStaticMarkup(createElement(PinHelp, { audience: "organizer" })));
    expect(html).toContain(
      "Le PIN est un code à donner à un bénévole qui n'a pas de compte : il ouvre la table de marque de ce concours seulement, pendant 24 h, sur son téléphone. Vous pouvez le révoquer à tout moment.",
    );
  });

  it("shows the 3 steps in order: create, give, the volunteer types it", () => {
    const html = renderToStaticMarkup(createElement(PinHelp, { audience: "volunteer" }));
    expect(html).toContain("<ol");
    const titles = [...html.matchAll(/<li[^>]*>.*?<span class="font-bold">([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(titles).toEqual(["Créer", "Donner", "Le bénévole saisit"]);
    expect(text(html)).toContain(t.volunteer.replace(/&#x27;/g, "'"));
    expect(html).not.toContain(t.organizer);
  });

  it("gives the scoring table address when known, never a PIN", () => {
    const html = renderToStaticMarkup(createElement(PinHelp, { audience: "organizer", tableUrl: "/c/7KQ2/table" }));
    expect(html).toContain("/c/7KQ2/table");
    expect(html).not.toMatch(/\b\d{4,8}\b(?!\/)/);
  });
});
