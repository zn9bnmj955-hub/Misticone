import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Scoring table and the A / B / C (TM3): a 13-team tournament with a B where
 * teams enter on their own (« opt_in »), 4 teams ticked « Inscrite au B » (the
 * last one offline: the outbox replays team.enterBracket), « Tirer le B »,
 * cadrage with an « Office » team, pause before the 1/2 finales, « Reprendre
 * le concours », then « Clore définitivement » (double confirmation).
 * The tournament is created for the test with the service key and deleted at the end.
 */

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";
const headers = { apikey: SECRET, authorization: `Bearer ${SECRET}`, "content-type": "application/json", prefer: "return=representation" };
const DEMO_CLUB = "843e1286-fe8e-4486-8189-836f21d047ac";
const DEMO_OWNER = "5050aade-77c4-4f16-896e-d282123cded3";

const config = {
  format: "single_elimination",
  bracketMode: "redraw",
  rounds: null,
  cadrage: { afterRound: 1 },
  consolation: { enabled: true, source: "losers_round_1", entry: "opt_in", feeCents: 500, losersOfRound: 1 },
  consolationC: { enabled: false, entry: "auto", feeCents: null },
  pause: { before: { remaining: 4 } },
  draw: { avoidSameClubFirstRound: true, seeding: false },
  pools: { size: 4, qualifiers: 2, system: "gsl" },
  autoNextRound: true,
  autoDrawAt: null,
  scoreEntry: "table",
  reservedVenuesFrom: "semifinal",
  forfeitScore: { winner: 13, loser: 0 },
  byeScore: { winner: 13, loser: 7 },
  ranking: ["wins", "point_diff", "points_for", "head_to_head", "random"],
};

interface StateMatch {
  id: string;
  status: string;
  sideA: string[];
  sideB: string[];
  roundId: string;
}
interface State {
  tournament: { status: string };
  teams: Record<string, { id: string; entries?: string[] }>;
  rounds: Record<string, { id: string; bracket: string; number: number; kind?: string }>;
  matches: Record<string, StateMatch>;
}

async function signIn(page: Page) {
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
  await page.getByLabel("Adresse email").fill("club@demo.orgasport.fr");
  await page.getByLabel("Mot de passe").fill("orgasport-demo");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("**/accueil");
}

async function state(request: APIRequestContext, code: string): Promise<State> {
  const res = await request.get(`/api/t/${code}/state`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { state: State }).state;
}

async function command(request: APIRequestContext, code: string, cmd: Record<string, unknown>) {
  const res = await request.post(`/api/t/${code}/commands`, { data: { clientOpId: randomUUID(), command: cmd } });
  expect(res.ok(), await res.text()).toBe(true);
}

/** Scores every open two-sided game of a bracket (side A wins 13-5). */
async function playOpen(request: APIRequestContext, code: string, bracket: string) {
  const s = await state(request, code);
  for (const m of Object.values(s.matches)) {
    if (s.rounds[m.roundId]?.bracket !== bracket || !m.sideA.length || !m.sideB.length) continue;
    if (["done", "forfeit", "bye"].includes(m.status)) continue;
    await command(request, code, { type: "match.score", matchId: m.id, scoreA: 13, scoreB: 5 });
  }
}

test.describe("scoring table: A / B, cadrage, pause and final close", () => {
  test("13 teams, B opt_in with 4 entries, pause then resume, close", async ({ page, context }) => {
    test.setTimeout(180_000);
    // Tournament of the demo club, created for this test.
    const created = await context.request.post(`${SUPABASE}/rest/v1/tournaments?select=id,short_code`, {
      headers,
      data: {
        club_id: DEMO_CLUB,
        created_by: DEMO_OWNER,
        sport_slug: "petanque",
        name: `Table B e2e ${Date.now().toString(36)}`,
        status: "check_in",
        team_format: "doublette",
        name_display: "full",
        starts_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        config,
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const [{ id, short_code: code }] = (await created.json()) as { id: string; short_code: string }[];
    try {
      const venues = Array.from({ length: 8 }, (_, i) => ({ tournament_id: id, label: String(i + 1), position: i + 1 }));
      expect((await context.request.post(`${SUPABASE}/rest/v1/venues`, { headers, data: venues })).ok()).toBe(true);

      await signIn(page);
      const api = page.request;
      for (let i = 1; i <= 13; i++) {
        await command(api, code, {
          type: "team.create",
          checkIn: true,
          source: "organizer",
          players: [
            { firstName: "Joueur", lastName: `A${i}` },
            { firstName: "Joueur", lastName: `B${i}` },
          ],
        });
      }

      // 1re partie of the A from the table: 6 games and 1 exempt.
      await page.goto(`/c/${code}/table`);
      await expect(page.getByText("En ligne")).toBeVisible({ timeout: 20_000 });
      await page.getByRole("button", { name: /Tirage/ }).click();
      await page.getByRole("button", { name: "Lancer le tirage" }).click();
      await expect(page.getByText("En ligne")).toBeVisible({ timeout: 20_000 });
      await expect.poll(async () => Object.keys((await state(api, code)).rounds).length).toBe(1);
      await playOpen(api, code, "main");

      // The B: the 6 losers can be ticked; nothing is drawn by itself.
      await page.reload();
      await page.getByRole("button", { name: /Tirage/ }).click();
      await page.getByRole("button", { name: "B", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Inscriptions au B" })).toBeVisible();
      await expect(page.getByText("Droit d'inscription : 5")).toBeVisible();
      const boxes = page.getByRole("checkbox", { name: /^Inscrite au B : / });
      await expect(boxes).toHaveCount(6);
      for (let i = 0; i < 3; i++) {
        await boxes.nth(i).check();
        await expect(page.getByText("En ligne")).toBeVisible({ timeout: 20_000 });
      }
      // The 4th entry is ticked offline: kept in the outbox, sent when the network is back.
      await context.setOffline(true);
      await boxes.nth(3).check();
      await expect(page.getByText("4 équipe(s) inscrite(s).")).toBeVisible();
      await expect(page.getByText(/1 saisie\(s\) en attente/).first()).toBeVisible();
      await context.setOffline(false);
      await expect(page.getByText("En ligne")).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(async () => Object.values((await state(api, code)).teams).filter((t) => t.entries?.includes("consolation")).length)
        .toBe(4);

      await page.getByRole("button", { name: "Tirer le B" }).click();
      await expect(page.getByRole("heading", { name: "Inscriptions au B" })).toBeHidden();
      await expect.poll(async () => Object.values((await state(api, code)).rounds).filter((r) => r.bracket === "consolation").length).toBe(1);

      // The cadrage of the A was drawn by itself: 3 games and 1 « Office ».
      await page.getByRole("button", { name: "A", exact: true }).click();
      await expect(page.getByText("Cadrage").first()).toBeVisible();
      await expect(page.getByText("Office", { exact: true })).toHaveCount(1);

      // Cadrage and the B's 1st game played: 4 left in the A, the pause holds the 1/2 finales.
      await playOpen(api, code, "main");
      await playOpen(api, code, "consolation");
      await page.reload();
      await expect(page.getByText("Concours en pause")).toBeVisible({ timeout: 20_000 });
      await page.getByRole("button", { name: "Reprendre le concours" }).click();
      await expect(page.getByText("Concours en pause")).toBeHidden();
      await expect
        .poll(async () => {
          const s = await state(api, code);
          return Object.values(s.rounds).filter((r) => r.bracket === "main").length;
        })
        .toBe(3);

      // Play everything out: the tournament ends.
      for (let i = 0; i < 4; i++) {
        await playOpen(api, code, "main");
        await playOpen(api, code, "consolation");
      }
      await expect.poll(async () => (await state(api, code)).tournament.status).toBe("finished");

      // Final close, far from the daily buttons, confirmed twice.
      await page.reload();
      await page.getByRole("button", { name: "Clore définitivement…" }).click();
      const confirm = page.getByRole("button", { name: "Clore définitivement", exact: true });
      await expect(confirm).toBeDisabled();
      await page.getByLabel(/J'ai vérifié tous les résultats/).check();
      await confirm.click();
      await expect(page.getByText("Concours clos définitivement").first()).toBeVisible({ timeout: 20_000 });
      await expect.poll(async () => (await state(api, code)).tournament.status).toBe("archived");
      // Nothing is accepted any more.
      const late = await api.post(`/api/t/${code}/commands`, { data: { clientOpId: randomUUID(), command: { type: "tournament.setStatus", status: "live" } } });
      expect(late.ok()).toBe(false);
    } finally {
      await context.request.delete(`${SUPABASE}/rest/v1/tournaments?id=eq.${id}`, { headers });
    }
  });
});
