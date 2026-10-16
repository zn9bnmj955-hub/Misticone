import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getSport } from "@orgasport/sports";
import { getMessages } from "@/i18n";
import { defaultForm, type FormContext } from "@/lib/tournament-form";
import { TeamStep } from "./TeamStep";
import type { StepProps } from "./types";

// K1: the "team" step of the tournament form, where the number of PINs is chosen,
// explains what a volunteer PIN is (organizer version, 3 steps), once.
const ctx: FormContext = { club: { name: "AS Test" }, person: { name: "Alex Martin", email: "alex@example.com" }, nowMs: Date.parse("2026-10-12T10:00:00Z") };
const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ");

describe("TeamStep (K1)", () => {
  const sport = getSport("petanque")!;
  const props: StepProps = {
    tournamentId: "t1",
    form: defaultForm(sport, ctx),
    sport,
    ctx,
    today: "2026-10-12",
    update: noop,
    replace: noop,
    error: () => undefined,
    vars: {},
    goTo: noop,
  };
  const html = renderToStaticMarkup(createElement(TeamStep, props));
  const t = getMessages().pinHelp;

  it("shows the PIN help for the organizer next to the number of PINs", () => {
    expect(html).toContain('aria-labelledby="pin-help-organizer"');
    const plain = text(html);
    expect(plain).toContain(t.organizer);
    expect(plain).not.toContain(t.volunteer);
    expect(plain.indexOf(getMessages().wizard.team.pinCount)).toBeLessThan(plain.indexOf(t.title));
    for (const step of t.steps) expect(plain).toContain(step.title);
  });

  it("does not repeat the explanation: the PIN group text only says where the codes are sent", () => {
    const plain = text(html);
    expect(plain.split("ce concours seulement").length - 1).toBe(1);
    expect(plain).toContain("Les codes sont créés à la publication et envoyés par email à alex@example.com.");
  });
});
