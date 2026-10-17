import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getSport } from "@orgasport/sports";
import { getMessages } from "@/i18n";
import { defaultForm, type FormContext, type TournamentForm } from "@/lib/tournament-form";
import { DrawStep } from "./DrawStep";
import { GeneralStep } from "./GeneralStep";
import type { StepProps } from "./types";

// F3: the form is short by default. One sport only -> no sport question (it comes
// back as soon as a second sport is enabled again); on the "Tirage" step the C, the
// B fee and the 2-day pause stay folded behind "Plus d'options", unless one of them
// is already used in the saved draft.

vi.mock("server-only", () => ({}));

// Football is disabled (P1); "football-on" simulates switching it back on.
vi.mock("@orgasport/sports", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@orgasport/sports")>();
  return {
    ...mod,
    getSport: (slug: string) => (slug === "football-on" ? { ...mod.getSport("football")!, enabled: true } : mod.getSport(slug)),
  };
});

const ctx: FormContext = { club: { name: "AS Test" }, person: { name: "Alex Martin", email: "alex@example.com" }, nowMs: Date.parse("2026-10-12T10:00:00Z") };
const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");
const sport = getSport("petanque")!;
const w = getMessages().wizard;

function props(form: Partial<TournamentForm> = {}): StepProps {
  return {
    tournamentId: "t1",
    form: { ...defaultForm(sport, ctx), ...form },
    sport,
    ctx,
    today: "2026-10-12",
    update: noop,
    replace: noop,
    error: () => undefined,
    vars: {},
    goTo: noop,
  };
}

describe("GeneralStep (F3)", () => {
  const render = (sportSlugs: string[]) => renderToStaticMarkup(createElement(GeneralStep, { ...props(), sportSlugs }));

  it("asks no sport question when pétanque is the only sport (football disabled)", () => {
    const html = render(["petanque", "football"]);
    expect(html).not.toContain('role="radiogroup"');
    expect(text(html)).toContain(w.general.nameGroup);
    expect(text(html)).not.toMatch(/foot/i);
  });

  it("asks the sport question again as soon as a second sport is enabled", () => {
    const html = render(["petanque", "football-on"]);
    expect(text(html)).toContain(w.general.sport);
    expect(text(html)).toMatch(/Football/);
  });
});

describe("DrawStep (F3)", () => {
  const render = (form: Partial<TournamentForm> = {}) => renderToStaticMarkup(createElement(DrawStep, props(form)));

  it("folds C, B fee and 2 days behind « Plus d'options » with the default values", () => {
    const html = render();
    expect(html).toContain('aria-expanded="false"');
    expect(text(html)).toContain(w.draw.moreOptions);
    expect(html).not.toContain('id="draw-more-options"');
  });

  it.each<[string, Partial<TournamentForm>]>([
    ["concours C", { consolationC: true }],
    ["droit d'inscription au B", { consolationFeeCents: 500 }],
    ["pause sur 2 jours", { pause: "before8" }],
  ])("opens the options when the draft already uses the %s", (_label, form) => {
    const html = render(form);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('id="draw-more-options"');
    expect(text(html)).toContain(w.draw.lessOptions);
  });
});
