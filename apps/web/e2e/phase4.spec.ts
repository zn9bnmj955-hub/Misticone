import { expect, test } from "@playwright/test";

/**
 * Phase 4 — a player registers to a tournament from the catalog: card →
 * details → registration form (works without JavaScript) → confirmation
 * with a calendar file; the team then appears in the public list.
 */

test.describe("catalog and registration", () => {
  test("register a team from the catalog", async ({ page }) => {
    test.setTimeout(120_000);
    const last = `Essai${Date.now().toString(36)}`;
    await page.goto("/concours");
    await page.locator('a[href="/concours/GP3M"]').first().click();
    await page.waitForURL("**/concours/GP3M");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByRole("link", { name: /S'inscrire/ }).first().click();
    await page.waitForURL("**/c/GP3M/inscription");
    await page.locator('input[name="p0_prenom"]').fill("Léa");
    await page.locator('input[name="p0_nom"]').fill(last);
    await page.locator('input[name="p1_prenom"]').fill("Paul");
    await page.locator('input[name="p1_nom"]').fill(last);
    await page.locator('input[name="cap_nom"]').fill(`Léa ${last}`);
    await page.locator('input[name="cap_tel"]').fill("06 12 34 56 78");
    await page.locator('input[name="reglement"]').check();
    await page.getByRole("button", { name: /Inscrire mon équipe/ }).click();

    await page.waitForURL(/\/c\/GP3M\/inscription\/ok\?equipe=\d+/);
    await expect(page.getByText(/Équipe n° \d+ inscrite/)).toBeVisible();
    const number = Number(new URL(page.url()).searchParams.get("equipe"));

    // Calendar file.
    const ics = await page.request.get("/c/GP3M/calendrier.ics");
    expect(ics.headers()["content-type"]).toContain("text/calendar");
    expect(await ics.text()).toContain("BEGIN:VEVENT");

    // The public page finds the team (names shown as initials by default).
    await page.goto(`/c/GP3M?equipe=${number}`);
    await expect(page.locator("#team-title")).toContainText(`Équipe ${number} · L. E. / P. E.`);
  });

  test("the registration form works without JavaScript and reports errors", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/c/GP3M/inscription");
    await page.locator('input[name="p0_prenom"]').fill("Zoé");
    await page.getByRole("button", { name: /Inscrire mon équipe/ }).click();
    await expect(page.getByText("Vérifiez les champs signalés.")).toBeVisible();
    await expect(page.locator('input[name="p0_prenom"]')).toHaveValue("Zoé");
    await context.close();
  });

  test("catalog filters work from the URL", async ({ page }) => {
    await page.goto("/concours?places=1");
    await expect(page.locator('a[href="/concours/GP3M"]').first()).toBeVisible();
    await page.goto("/concours?quand=aujourdhui&places=1");
    await expect(page.locator('a[href="/concours/GP3M"]')).toHaveCount(0);
  });
});
