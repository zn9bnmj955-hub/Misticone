import { describe, expect, it } from "vitest";
import { makeState, playToEnd } from "./test-helpers";

/** The form accepts up to 1024 teams: a 512-team day must stay fast and complete (> 1 000 matches). */
describe("large tournaments", () => {
  it("plays a 512-team swiss in 5 rounds (1 280 matches) to the end within the time budget", () => {
    const t0 = performance.now();
    const s = playToEnd(makeState({ teams: 512, teamFormat: "triplette", venues: 256, config: { format: "swiss", rounds: 5 } }), "big");
    const ms = performance.now() - t0;
    expect(s.tournament.status).toBe("finished");
    expect(Object.keys(s.matches).length).toBe(1280);
    expect(ms).toBeLessThan(20_000);
  }, 30_000);
});
