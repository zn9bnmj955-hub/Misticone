import { expect, test } from "@playwright/test";

/**
 * Speed budgets. Tournament-day pages must stay tiny and framework-free
 * (priority 1: a player finds the next match in under 10 seconds, even on a
 * poor network); the showcase never downloads a video before a click.
 */

const TERRAIN_PAGES = ["/c/7KQ2", "/c/7KQ2?equipe=1", "/c/7KQ2?vue=classement", "/c/GP3M/inscription", "/c/C4DR", "/c/2J7P"];

test.describe("speed budgets", () => {
  for (const url of TERRAIN_PAGES) {
    test(`terrain page ${url} stays under 100 KB without a JS framework`, async ({ request }) => {
      const res = await request.get(url);
      expect(res.ok()).toBe(true);
      const html = await res.text();
      expect(Buffer.byteLength(html)).toBeLessThan(100 * 1024);
      expect(html).not.toContain("/_next/static/chunks/");
      // Readable without JavaScript: the content is in the HTML itself.
      expect(html).toContain("<main");
    });
  }

  test("the landing and the videos page load no video before a click", async ({ page }) => {
    const media: string[] = [];
    page.on("request", (r) => {
      if (/\.(mp4|webm)(\?|$)/.test(r.url())) media.push(r.url());
    });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.goto("/decouvrir", { waitUntil: "networkidle" });
    expect(media).toEqual([]);
  });

  test("no 3D on the landing when the person asks for reduced motion", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(2500); // Past the idle delay that would load the 3D.
    await expect(page.locator("[data-ball]").first()).toHaveAttribute("data-ball", "static");
    await expect(page.locator("[data-ball-canvas]")).toHaveCount(0);
    await context.close();
  });

  test("fonts stay light", async ({ page }) => {
    const sizes: number[] = [];
    page.on("response", async (r) => {
      if (r.url().endsWith(".woff2")) sizes.push((await r.body()).length);
    });
    await page.goto("/", { waitUntil: "networkidle" });
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeLessThan(50 * 1024);
  });
});
