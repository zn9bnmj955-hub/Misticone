import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Scoring table on an old computer (TM1). The volunteer types scores fast,
 * often on a slow laptop and a poor connection: entries must feel instant
 * with a CPU slowed down 6x, and the page must stay reasonably light.
 * Entries are typed offline so the demo database is never modified (the
 * queue lives in this test context's localStorage and is thrown away).
 */

async function pinLogin(page: Page) {
  await page.goto("/c/7KQ2/table");
  await page.getByLabel("Code PIN").fill("4821");
  await page.getByRole("button", { name: "Ouvrir la table de marque" }).click();
  await expect(page.getByText("En ligne")).toBeVisible({ timeout: 15_000 });
}

/** Timings and weights only mean something on a production build (E2E_BASE_URL). */
async function isDevServer(page: Page): Promise<boolean> {
  return /hmr/i.test(await (await page.request.get("/c/7KQ2/table")).text());
}

async function playingVenues(context: BrowserContext): Promise<string[]> {
  const res = await context.request.get("/api/t/7KQ2/state");
  expect(res.ok()).toBe(true);
  const { state } = (await res.json()) as {
    state: { matches: Record<string, { status: string; venueId: string | null }>; venues: Record<string, { id: string; label: string }> };
  };
  const label = new Map(Object.values(state.venues).map((v) => [v.id, v.label]));
  return Object.values(state.matches)
    .filter((m) => m.status === "playing" && m.venueId)
    .map((m) => label.get(m.venueId!)!);
}

test.describe("scoring table on an old computer", () => {
  test("a score typed with a CPU slowed down 6x shows up at once (< 250 ms in production)", async ({ page, context }) => {
    const dev = await isDevServer(page);
    await pinLogin(page);
    const venues = (await playingVenues(context)).slice(0, 3);
    expect(venues.length).toBeGreaterThan(0);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    await page.getByRole("button", { name: /Scores/ }).click();
    await context.setOffline(true);
    const times: number[] = [];
    for (const label of venues) {
      await page.locator("#quick-score").fill(`${label} 13 7`);
      // From the submit to the next painted frame showing the confirmation.
      times.push(
        await page.evaluate(async (label) => {
          const input = document.getElementById("quick-score") as HTMLInputElement;
          const start = performance.now();
          input.form!.requestSubmit();
          await new Promise<void>((done) => {
            const check = () => (document.body.innerText.includes(`Terrain ${label} :`) ? done() : requestAnimationFrame(check));
            check();
          });
          await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
          return performance.now() - start;
        }, label),
      );
    }
    await expect(page.getByText(`${venues.length} saisie(s) en attente`).first()).toBeVisible();
    // Production build: about 100 ms each (TM1); the dev build of React is much slower.
    expect(Math.max(...times)).toBeLessThan(dev ? 1500 : 250);
  });

  test("the page JavaScript stays under 350 KB compressed (production build)", async ({ page }) => {
    test.skip(await isDevServer(page), "Weights are only meaningful on a production build (E2E_BASE_URL).");
    await pinLogin(page);
    // Bytes on the wire (compressed), measured on a fresh load.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.clearBrowserCache");
    const scripts = new Set<string>();
    let js = 0;
    cdp.on("Network.responseReceived", (e) => e.type === "Script" && scripts.add(e.requestId));
    cdp.on("Network.loadingFinished", (e) => scripts.has(e.requestId) && (js += e.encodedDataLength));
    await page.reload();
    await expect(page.getByText("En ligne")).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    // Measured at 298 KB (985 KB once decompressed) on Next 16.4.
    expect(js).toBeLessThan(350 * 1024);
  });

  test("reopens without network once the public page has installed the service worker", async ({ page, context }) => {
    test.skip(await isDevServer(page), "The dev server serves unversioned chunks: production build only.");
    await page.goto("/c/7KQ2");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await pinLogin(page);
    await page.reload();
    await expect(page.getByText("En ligne")).toBeVisible({ timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: "Hors ligne" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Scores/ })).toBeVisible();
  });
});
