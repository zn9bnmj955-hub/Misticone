import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";

/**
 * T4 — public tournament page without network.
 * - a page opened once stays readable offline (service worker): the draw and the teams page;
 * - an offline reload shows the LAST draw (newest live fragment spliced into the cached page);
 * - « Enregistrer pour hors ligne » downloads a self-contained .html that opens from file://.
 */

async function cachedPaths(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const cache = await caches.open("terrain-v1");
    return (await cache.keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search);
  });
}

async function openOnceOnline(page: Page) {
  await page.goto("/c/7KQ2");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // The worker is asked (once ready) to keep this page and the teams page, even on a first visit.
  await expect.poll(() => cachedPaths(page), { timeout: 15_000 }).toEqual(expect.arrayContaining(["/c/7KQ2", "/c/7KQ2/equipes"]));
}

/**
 * No network at all: in Chromium, Playwright applies the offline mode to the service
 * worker's own fetches only with this switch (read when the worker starts).
 */
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

async function goOffline(context: BrowserContext) {
  await context.setOffline(true);
}

async function goOnline(context: BrowserContext) {
  await context.setOffline(false);
}

test.describe("terrain pages offline", () => {
  test("an offline reload of /c/7KQ2 shows the last draw, and the teams page stays readable", async ({ page, context }) => {
    await openOnceOnline(page);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await goOffline(context);
    // Really offline, worker included: an address never kept answers « Hors connexion ».
    expect(await page.evaluate(() => fetch("/c/9999").then((r) => r.status))).toBe(503);
    await page.reload();
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("table.sheet").first()).toBeVisible();
    await expect(page.locator("table.sheet thead th").first()).toHaveText("Terrain");
    await expect(page.locator("html")).toHaveClass(/is-offline/);
    await page.goto("/c/7KQ2/equipes");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("table").first()).toBeVisible();
  });

  test("the newest live refresh replaces the draw of the cached page when reloading offline", async ({ page, context }) => {
    await openOnceOnline(page);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    // A live refresh received later (newer version) is kept by the worker.
    await page.evaluate(async () => {
      const cache = await caches.open("terrain-v1");
      const body = '<div id="live" data-version="999999"><main><p id="newest">Tirage le plus récent</p></main></div>';
      await cache.put("/c/7KQ2?fragment=1", new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } }));
    });
    await goOffline(context);
    await page.reload();
    await expect(page.locator("#newest")).toHaveText("Tirage le plus récent");
    await expect(page.locator("h1")).toBeVisible(); // header of the cached page kept
    // An older fragment never replaces a newer page.
    await goOnline(context);
    await page.reload(); // online: the fresh page is cached again
    await page.evaluate(async () => {
      const cache = await caches.open("terrain-v1");
      await cache.put("/c/7KQ2?fragment=1", new Response('<div id="live" data-version="1"><p id="older">vieux</p></div>'));
    });
    await goOffline(context);
    await page.reload();
    await expect(page.locator("table.sheet").first()).toBeVisible();
    await expect(page.locator("#older")).toHaveCount(0);
  });

  test("« Enregistrer pour hors ligne » downloads a self-contained file that opens from file:// without network", async ({ page, browser }, info) => {
    await page.goto("/c/7KQ2");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Enregistrer pour hors ligne" }).click()]);
    expect(download.suggestedFilename()).toBe("orgasport-7KQ2.html");
    const file = info.outputPath("orgasport-7KQ2.html");
    await download.saveAs(file);

    const offline = await browser.newContext({ offline: true, javaScriptEnabled: false });
    const requests: string[] = [];
    offline.on("request", (r) => {
      if (!r.url().startsWith("file:")) requests.push(r.url());
    });
    const saved = await offline.newPage();
    await saved.goto(pathToFileURL(file).href);
    await expect(saved.locator("h1")).toBeVisible();
    await expect(saved.locator("table.sheet").first()).toBeVisible();
    await expect(saved.locator("table.sheet thead th").first()).toHaveText("Terrain");
    await expect(saved.getByText(/Copie enregistrée le .* à \d{1,2} h \d{2}, sans actualisation\./)).toBeVisible();
    // CSS inlined (the page is styled), no script, no form, nothing fetched from the network.
    expect(await saved.locator("script").count()).toBe(0);
    expect(await saved.locator("form").count()).toBe(0);
    expect(await saved.locator("link[rel]").count()).toBe(0);
    expect(await saved.locator("table.sheet").first().evaluate((t) => getComputedStyle(t).borderCollapse)).toBe("collapse");
    expect(requests).toEqual([]);
    await offline.close();
  });

  test("printing gives the draw sheets only (Terrain | Équipe | Équipe | Score), without search, tabs or buttons", async ({ page }) => {
    await page.goto("/c/7KQ2");
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("table.sheet").first()).toBeVisible();
    const heads = await page.locator("table.sheet").first().locator("thead th").allTextContents();
    expect(heads.map((h) => h.trim())).toEqual(["Terrain", "Équipe", "Équipe", "Score"]);
    for (const hidden of ["form.find", "nav.tabs", "p.save", "footer.foot", ".sheet-nav"]) await expect(page.locator(hidden).first()).toBeHidden();
    expect(await page.locator("table.sheet thead").first().evaluate((t) => getComputedStyle(t).display)).toBe("table-header-group");
  });
});
