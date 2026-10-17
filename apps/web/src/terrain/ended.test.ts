import { beforeEach, describe, expect, it } from "vitest";
import type { EngineState } from "@orgasport/engine";
import { requireSport } from "@orgasport/sports";
import type { TournamentMeta } from "@/lib/tournament/load";
import { exec, makeState, playToEnd, resetOps } from "../../../../packages/engine/src/test-helpers";
import { renderTerrainPage, type RenderInput } from "./render";

/** Lot 2, T5: /c/CODE of a finished tournament, then of a closed one (« Lien clôturé »). */

const meta = {
  short_code: "FIN2",
  name: "Concours fini",
  status: "live",
  starts_at: "2026-10-12T12:00:00Z",
  registration_closes_at: null,
  checkin_closes_at: null,
  city: "Aubagne",
  team_format: "doublette",
  name_display: "full",
  registration_mode: "online",
  max_teams: null,
  waitlist_enabled: false,
} as unknown as TournamentMeta;

beforeEach(() => resetOps());

function page(state: EngineState, o: Partial<RenderInput> = {}): string {
  return renderTerrainPage(
    { meta: { ...meta, status: state.tournament.status }, sport: requireSport("petanque"), state, version: 1, view: "tirage", query: null, mine: null, message: null, now: new Date("2026-10-12T18:30:00Z"), ...o },
    { fragment: false },
  );
}

const start = () => makeState({ teams: 8, config: { bracketMode: "redraw", scoreEntry: "captains", consolation: { enabled: false, entry: "auto" } } });

describe("terrain page: finished, closed", () => {
  it("while the tournament is live: no banner, the captain of a team in play gets the score form", () => {
    const s = exec(start(), { type: "round.draw", bracket: "main", seed: "t5" });
    const html = page(s, { mine: 1 });
    expect(html).not.toContain('class="ended"');
    expect(html).toContain('class="score-form"');
  });

  it("finished: « Concours terminé », the winner, no score form, no registration link", () => {
    const s = playToEnd(start(), "t5");
    expect(s.tournament.status).toBe("finished");
    const html = page(s, { mine: 1 });
    expect(html).toContain('class="ended"');
    expect(html).toContain("Concours terminé");
    expect(html).toMatch(/Vainqueur : l&#39;équipe \d+|Vainqueur : l'équipe \d+/);
    expect(html).toContain("Les inscriptions et la saisie des scores par les capitaines sont fermées");
    expect(html).not.toContain("Lien clôturé");
    expect(html).not.toContain('class="score-form"');
    expect(html).not.toContain("/inscription");
  });

  it("closed: « Concours terminé · Lien clôturé », final results still shown", () => {
    const s = exec(playToEnd(start(), "t5"), { type: "tournament.close" });
    expect(s.tournament.status).toBe("archived");
    const html = page(s, { mine: 1 });
    expect(html).toContain("Concours terminé · Lien clôturé");
    expect(html).toContain("Plus aucune modification n");
    expect(html).toContain("<table");
    expect(html).not.toContain('class="score-form"');
  });

  it("the banner is in the live fragment, so a page left open shows it on its next refresh", () => {
    const s = playToEnd(start(), "t5");
    const frag = renderTerrainPage(
      { meta: { ...meta, status: "finished" }, sport: requireSport("petanque"), state: s, version: 2, view: "tirage", query: null, mine: null, message: null, now: new Date() },
      { fragment: true },
    );
    expect(frag).toContain("Concours terminé");
  });
});
