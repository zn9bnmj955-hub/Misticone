import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireSport } from "@orgasport/sports";
import type { TournamentMeta } from "@/lib/tournament/load";
import { makeState } from "../../../../packages/engine/src/test-helpers";
import { NOTIFY_SCRIPT } from "./notify-script";
import { renderConfirmationPage } from "./registration";
import { renderTerrainPage, type RenderInput } from "./render";

const meta = {
  short_code: "7KQ2",
  name: "Concours test",
  status: "check_in",
  starts_at: "2026-10-12T12:00:00Z",
  registration_closes_at: "2026-10-12T11:00:00Z",
  checkin_closes_at: "2026-10-12T11:45:00Z",
  city: "Aubagne",
  address: "Boulodrome",
  postcode: "13400",
  team_format: "doublette",
  name_display: "full",
  fee_cents: 0,
  fee_per: "team",
  prize_text: null,
  rules_text: null,
  registration_mode: "organizer",
  max_teams: null,
} as unknown as TournamentMeta;

function page(o: Partial<RenderInput> = {}) {
  const input: RenderInput = {
    meta,
    sport: requireSport("petanque"),
    state: makeState({ teams: 32 }),
    version: 1,
    view: "tirage",
    query: null,
    mine: 14,
    message: null,
    now: new Date("2026-10-12T12:30:00Z"),
    ...o,
  };
  return renderTerrainPage(input, { fragment: false });
}

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"));
afterEach(() => vi.unstubAllEnvs());

describe("notify button on terrain pages", () => {
  it("is plain ES5", () => {
    expect(() => new Function(NOTIFY_SCRIPT)).not.toThrow();
    expect(NOTIFY_SCRIPT).not.toMatch(/=>|\b(let|const|class)\s|`|\.\.\./);
  });

  it("is in the my-team card, hidden by default, with the script, and the page stays light", () => {
    const out = page();
    const block = /<div class="no-print" data-notify data-code="7KQ2" data-team="14">([\s\S]*?)\n<\/div>/.exec(out);
    expect(block).not.toBeNull();
    // Everything inside starts hidden: without JS (or without push) nothing shows.
    expect(block![1]).toMatch(/data-btn hidden><button type="button"/);
    expect(block![1]).toMatch(/data-msg role="status" hidden>/);
    expect(block![1]).toMatch(/data-ios hidden>/);
    expect(out).toContain("var OS_N=");
    expect(out).toContain('<link rel="manifest" href="/terrain.webmanifest">');
    expect(out.indexOf("var OS_N=")).toBeGreaterThan(out.indexOf("data-notify"));
    expect(Buffer.byteLength(out)).toBeLessThan(100_000);
  });

  it("is absent without a team, once the tournament is over, or without push configured", () => {
    expect(page({ mine: null })).not.toContain("data-notify");
    expect(page({ mine: null })).not.toContain("OS_N");
    expect(page({ meta: { ...meta, status: "finished" } as TournamentMeta })).not.toContain("data-notify");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    expect(page()).not.toContain("data-notify");
  });

  it("is offered on the registration confirmation", () => {
    const out = renderConfirmationPage({ meta, sport: requireSport("petanque"), team: { number: 33, status: "registered", label: "Martin / Durand" }, waitlistPosition: null });
    const section = /<section id="notify"[\s\S]*?<\/section>/.exec(out)?.[0] ?? "";
    expect(section).toContain('data-notify data-code="7KQ2" data-team="33"');
    expect(section).toMatch(/data-btn hidden>/);
    expect(out).toContain("var OS_N=");
    expect(Buffer.byteLength(out)).toBeLessThan(100_000);
  });
});
