import { describe, expect, it } from "vitest";
import type { TeamShape } from "@/lib/tournament/registration-rules";
import { FIELD, hasTeammates, issueField, parseRegistrationForm, renderRegistrationPage } from "./registration";
import { requireSport } from "@orgasport/sports";
import type { TournamentMeta } from "@/lib/tournament/load";

const shape: TeamShape = { players: 2, substitutes: 1, individual: false, license: "optional", licenseHint: null, categories: null };

describe("registration form parsing", () => {
  it("keeps required players, drops an empty substitute and trims", () => {
    const form = new URLSearchParams({
      [FIELD.first(0)]: " Léa ",
      [FIELD.last(0)]: "Martin",
      [FIELD.license(0)]: "12 34 56 78",
      [FIELD.first(1)]: "Paul",
      [FIELD.last(1)]: "Durand",
      [FIELD.first(2)]: "",
      [FIELD.last(2)]: "",
      [FIELD.captainName]: "Léa Martin",
      [FIELD.email]: "lea@example.com",
      [FIELD.rules]: "on",
      [FIELD.honeypot]: "",
    });
    const { input, honeypot } = parseRegistrationForm(form, shape);
    expect(input.players).toEqual([
      { firstName: "Léa", lastName: "Martin", license: "12345678", category: null },
      { firstName: "Paul", lastName: "Durand", license: null, category: null },
    ]);
    expect(input.captain).toEqual({ name: "Léa Martin", phone: null, email: "lea@example.com" });
    expect(input.acceptedRules).toBe(true);
    expect(honeypot).toBe("");
  });

  it("keeps a filled substitute and ignores licenses when not asked", () => {
    const form = new URLSearchParams({ [FIELD.first(2)]: "Zoé", [FIELD.last(2)]: "Petit", [FIELD.license(0)]: "999" });
    const { input } = parseRegistrationForm(form, { ...shape, license: "hidden" });
    expect(input.players).toHaveLength(3);
    expect(input.players[0]!.license).toBeNull();
  });

  it("maps engine issue paths to form fields", () => {
    expect(issueField({ path: "players.1.license", code: "license" })).toBe(FIELD.license(1));
    expect(issueField({ path: "captain", code: "contact" })).toBe(FIELD.phone);
  });
});

describe("registration page", () => {
  const meta = {
    short_code: "GP3M",
    name: "Grand Prix <test>",
    starts_at: "2026-10-24T12:30:00Z",
    checkin_closes_at: "2026-10-24T12:15:00Z",
    registration_closes_at: "2026-10-24T11:45:00Z",
    address: "Boulodrome",
    postcode: "13400",
    city: "Aubagne",
    team_format: "doublette",
    category: "veterans",
    fee_cents: 1000,
    fee_per: "team",
    prize_text: null,
    rules_text: "Règlement FFPJP.",
  } as unknown as TournamentMeta;

  it("escapes text, keeps values and stays light without JavaScript", () => {
    const page = renderRegistrationPage({
      meta,
      sport: requireSport("petanque"),
      shape: { ...shape, license: "required", licenseHint: "6 à 10 chiffres" },
      window: "open",
      values: { [FIELD.first(0)]: '"><script>' },
      issues: [{ path: "players.0.license", code: "required" }],
      notice: null,
      signedIn: false,
      turnstileSiteKey: null,
      rulesPdfUrl: null,
    });
    expect(page).toContain("Grand Prix &lt;test&gt;");
    expect(page).not.toContain('"><script>');
    expect(page).toContain('aria-invalid="true"');
    expect(page).toContain("Vétérans");
    expect(page).not.toMatch(/<script src=/);
    expect(page.length).toBeLessThan(100_000);
  });

  it("shows a message instead of the form when closed", () => {
    const page = renderRegistrationPage({
      meta,
      sport: requireSport("petanque"),
      shape,
      window: "closed",
      values: {},
      issues: [],
      notice: null,
      signedIn: false,
      turnstileSiteKey: null,
      rulesPdfUrl: null,
    });
    expect(page).toContain("Les inscriptions en ligne sont closes.");
    expect(page).toContain('href="/legal/mentions-legales"');
    expect(page).toContain('href="/legal/confidentialite"');
    expect(page).not.toContain("<form");
  });

  it.each([
    ["finished", "Ce concours est terminé : les inscriptions ne sont plus possibles."],
    ["archived", "Lien clôturé : ce concours est terminé, plus aucune inscription n&#39;est possible."],
  ])("T5: says why when the tournament is %s, without the form", (status, text) => {
    const page = renderRegistrationPage({
      meta: { ...meta, status } as TournamentMeta,
      sport: requireSport("petanque"),
      shape,
      window: "closed",
      values: {},
      issues: [],
      notice: null,
      signedIn: false,
      turnstileSiteKey: null,
      rulesPdfUrl: null,
    });
    expect(page).toContain(text);
    expect(page).not.toContain("Les inscriptions en ligne sont closes.");
    expect(page).not.toContain("<form");
  });

  it("informs players about their data and asks the captain to inform teammates", () => {
    const opts = {
      sport: requireSport("petanque"),
      window: "open" as const,
      values: {},
      issues: [],
      notice: null,
      signedIn: false,
      turnstileSiteKey: null,
      rulesPdfUrl: null,
    };
    const page = renderRegistrationPage({ ...opts, meta: { ...meta, name_display: "full", club: { name: "Boule d'Or", slug: "bo" } }, shape });
    expect(page).toContain("Boule d&#39;Or, organisateur du concours");
    expect(page).toContain("en entier (prénom et nom)");
    expect(page).toContain('href="/legal/confidentialite"');
    expect(page).toContain(`name="${FIELD.teammates}"`);
    const solo = renderRegistrationPage({ ...opts, meta, shape: { ...shape, players: 1, substitutes: 0, individual: true } });
    expect(solo).toContain("avec les initiales seulement");
    expect(solo).not.toContain(`name="${FIELD.teammates}"`);
    expect(hasTeammates(shape)).toBe(true);
    expect(issueField({ path: "teammates", code: "rules" })).toBe(FIELD.teammates);
  });
});
