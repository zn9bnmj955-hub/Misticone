import { expect, test } from "@playwright/test";

/** Lot 2, T2: the draw tab as big tables (Terrain | Équipe | Équipe | Score), my team's next game first. */

test.describe("terrain draw sheets", () => {
  test("a player finds the next match at the top of the page, above the draw sheets", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const start = Date.now();
    await page.goto("/c/7KQ2?equipe=14");
    const card = page.locator("#mon-equipe");
    await expect(card).toContainText("Équipe 14");
    await expect(card.locator(".v").first()).toBeInViewport();
    expect(Date.now() - start).toBeLessThan(10_000);
    const cardBox = (await card.boundingBox())!;
    const sheetBox = (await page.locator("table.sheet").first().boundingBox())!;
    expect(cardBox.y).toBeLessThan(sheetBox.y);
    await expect(page.locator("table.sheet td.me").first()).toContainText("14");
  });

  test("one table per round with the results-page columns, readable without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/c/7KQ2");
    const first = page.locator("table.sheet").first();
    await expect(first.locator("th")).toHaveText(["Terrain", "Équipe", "Équipe", "Score"]);
    await expect(page.locator(".sheets h3").first()).toHaveText(/^Résultats /);
    await expect(page.getByRole("link", { name: "Résultats par équipes" })).toHaveAttribute("href", "/c/7KQ2/equipes");
    await expect(page.getByText("Ctrl+F pour chercher une équipe, F5 pour actualiser la page.")).toBeVisible();
    // A then B, reachable by anchors.
    await page.getByRole("link", { name: "Concours B" }).click();
    await expect(page).toHaveURL(/#concours-b$/);
    await expect(page.locator("#concours-b table.sheet").first()).toBeVisible();
    // Played games: one greyed cell and a score; no horizontal scroll on a phone.
    await expect(page.locator("table.sheet td.l").first()).toBeVisible();
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await context.close();
  });
});
