import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Scoring table without network (TM2): opened once online, the page reloads
 * offline (service worker), the engine state and the outbox come back from
 * localStorage, scores typed offline are sent once the network is back, and
 * each one reaches the database exactly once. The 3 scores are undone at the
 * end so the demo tournament is left as it was.
 */

interface Action {
  id: number;
  type: string;
  payload: { matchId?: string } & Record<string, unknown>;
  undone_at: string | null;
}

async function pinLogin(page: Page) {
  await page.goto("/c/7KQ2/table");
  await page.getByLabel("Code PIN").fill("4821");
  await page.getByRole("button", { name: "Ouvrir la table de marque" }).click();
  await expect(page.getByText("En ligne")).toBeVisible({ timeout: 15_000 });
}

/** The dev server waits for its live-reload socket before hydrating: offline reloads only work on a production build (E2E_BASE_URL). */
async function isDevServer(page: Page): Promise<boolean> {
  return /hmr/i.test(await (await page.request.get("/c/7KQ2/table")).text());
}

async function playing(request: APIRequestContext) {
  const res = await request.get("/api/t/7KQ2/state");
  expect(res.ok()).toBe(true);
  const { state } = (await res.json()) as {
    state: {
      matches: Record<string, { id: string; status: string; venueId: string | null; scoreA: number | null; scoreB: number | null }>;
      venues: Record<string, { id: string; label: string }>;
    };
  };
  const label = new Map(Object.values(state.venues).map((v) => [v.id, v.label]));
  return {
    matches: state.matches,
    list: Object.values(state.matches)
      .filter((m) => (m.status === "playing" || m.status === "ready") && m.venueId)
      .map((m) => ({ id: m.id, venue: label.get(m.venueId!)! })),
  };
}

async function history(request: APIRequestContext): Promise<Action[]> {
  const res = await request.get("/api/t/7KQ2/history");
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { actions: Action[] }).actions;
}

test.describe("scoring table without network", () => {
  test("opened online, reloaded offline: 3 scores typed offline reach the database once each", async ({ page, context }) => {
    test.setTimeout(120_000);
    test.skip(await isDevServer(page), "The dev server does not hydrate without its live-reload socket: production build only.");
    await pinLogin(page);
    // The page asked the service worker to keep it: wait until it is stored.
    await expect
      .poll(() => page.evaluate(async () => Boolean(await caches.match("/c/7KQ2/table"))), { timeout: 30_000 })
      .toBe(true);
    const before = await playing(context.request);
    const picked = before.list.slice(0, 3);
    expect(picked).toHaveLength(3);
    const lastActionId = (await history(context.request))[0]?.id ?? 0;

    await context.setOffline(true);
    await page.reload();
    // Reopened from the cache, data from this device, connection badge visible.
    await expect(page.getByRole("status").filter({ hasText: "Hors ligne" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Scores/ }).click();
    for (const m of picked) {
      await page.locator("#quick-score").fill(`${m.venue} 13 7`);
      await page.locator("#quick-score").press("Enter");
      await expect(page.getByText(`Terrain ${m.venue} :`).first()).toBeVisible();
    }
    await expect(page.getByText("3 saisie(s) en attente").first()).toBeVisible();
    // The outbox survives a second offline reload too.
    await page.reload();
    await expect(page.getByText("3 saisie(s) en attente").first()).toBeVisible({ timeout: 15_000 });

    await context.setOffline(false);
    await expect(page.getByRole("status").filter({ hasText: "En ligne" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/saisie\(s\) en attente/)).toHaveCount(0);

    const after = await playing(context.request);
    for (const m of picked) {
      expect(after.matches[m.id]?.scoreA).toBe(13);
      expect(after.matches[m.id]?.scoreB).toBe(7);
    }
    const added = (await history(context.request)).filter((a) => a.id > lastActionId);
    for (const m of picked) {
      expect(added.filter((a) => a.type === "match.score" && a.payload.matchId === m.id)).toHaveLength(1);
    }

    // Leave the demo as it was: undo the 3 scores, newest first.
    for (const a of added.filter((x) => x.type === "match.score" && !x.undone_at).sort((x, y) => y.id - x.id)) {
      const res = await context.request.post("/api/t/7KQ2/undo", { data: { actionId: a.id, clientOpId: crypto.randomUUID() } });
      expect(res.ok()).toBe(true);
    }
  });

  test("backup printing without network: draw sheets in the ppf layout (Terrain | Équipe | Équipe | Score)", async ({ page, context }) => {
    await page.addInitScript(() => {
      window.print = () => undefined;
    });
    await pinLogin(page);
    await context.setOffline(true);
    await page.getByRole("button", { name: /Impression/ }).click();
    await page.getByRole("button", { name: /Tous les tours/ }).click();
    const sheet = page.locator("#print-root");
    await expect(sheet.locator("section").first()).toBeAttached();
    const heads = await sheet.locator("thead tr").first().locator("th").allTextContents();
    expect(heads.map((h) => h.trim())).toEqual(["Terrain", "Équipe", "Équipe", "Score"]);
    const titles = await sheet.locator("h2").allTextContents();
    expect(titles.length).toBeGreaterThan(1);
    expect(titles.every((x) => /^(Concours [ABC] · )?Résultats /.test(x))).toBe(true);
    // Newest round first, games in progress shown as "**", names "NOM PRÉNOM" in capitals.
    expect(titles[0]).toContain("Concours A · Résultats 1/8 de finale");
    expect(titles[1]).toContain("Concours A · Résultats 1re partie");
    await expect(sheet.locator("td", { hasText: /^\*\*$/ }).first()).toBeAttached();
    const name = ((await sheet.locator("tbody td:nth-child(2) div").first().textContent()) ?? "").trim();
    expect(name).toMatch(/[A-Z]/);
    expect(name).toBe(name.toUpperCase());
  });
});
