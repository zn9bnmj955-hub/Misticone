import { expect, test, type APIRequestContext } from "@playwright/test";

/** A tournament open to online registration (other test files may have started GP3M). */
async function openTournament(request: APIRequestContext): Promise<string> {
  const html = await (await request.get("/concours?places=1")).text();
  const code = /href="\/c\/([2-9A-HJKMNP-Z]{4,6})\/inscription"/.exec(html)?.[1];
  expect(code, "an open tournament in the catalog").toBeTruthy();
  return code!;
}

/**
 * Phase 4 — a player registers to a tournament from the catalog: card →
 * details → registration form (works without JavaScript) → confirmation
 * with a calendar file; the team then appears in the public list.
 */

test.describe("catalog and registration", () => {
  test("register a team from the catalog", async ({ page }) => {
    test.setTimeout(120_000);
    const last = `Essai${Date.now().toString(36)}`;
    const code = await openTournament(page.request);
    await page.goto("/concours?places=1");
    await page.locator(`a[href="/concours/${code}"]`).first().click();
    await page.waitForURL(`**/concours/${code}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByRole("link", { name: /S'inscrire/ }).first().click();
    await page.waitForURL(`**/c/${code}/inscription`);
    await page.locator('input[name="p0_prenom"]').fill("Léa");
    await page.locator('input[name="p0_nom"]').fill(last);
    await page.locator('input[name="p1_prenom"]').fill("Paul");
    await page.locator('input[name="p1_nom"]').fill(last);
    await page.locator('input[name="cap_nom"]').fill(`Léa ${last}`);
    await page.locator('input[name="cap_tel"]').fill("06 12 34 56 78");
    await page.locator('input[name="reglement"]').check();
    await page.locator('input[name="coequipiers"]').check();
    await page.getByRole("button", { name: /Inscrire mon équipe/ }).click();

    await page.waitForURL(/\/inscription\/ok\?equipe=\d+/);
    await expect(page.getByText(/Équipe n° \d+ inscrite/)).toBeVisible();
    const number = Number(new URL(page.url()).searchParams.get("equipe"));

    // Calendar file.
    const ics = await page.request.get(`/c/${code}/calendrier.ics`);
    expect(ics.headers()["content-type"]).toContain("text/calendar");
    expect(await ics.text()).toContain("BEGIN:VEVENT");

    // The public page finds the team (names shown as initials by default).
    await page.goto(`/c/${code}?equipe=${number}`);
    await expect(page.locator("#team-title")).toContainText(`Équipe ${number} · L. E. / P. E.`);
  });

  test("the registration form works without JavaScript and reports errors", async ({ browser, request }) => {
    const code = await openTournament(request);
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`/c/${code}/inscription`);
    await page.locator('input[name="p0_prenom"]').fill("Zoé");
    await page.getByRole("button", { name: /Inscrire mon équipe/ }).click();
    await expect(page.getByText("Vérifiez les champs signalés.")).toBeVisible();
    await expect(page.locator('input[name="p0_prenom"]')).toHaveValue("Zoé");
    await context.close();
  });

  test("catalog filters work from the URL", async ({ page }) => {
    const code = await openTournament(page.request);
    await page.goto("/concours?places=1");
    await expect(page.locator(`a[href="/concours/${code}"]`).first()).toBeVisible();
    // Finished tournaments never show; nothing matches a sport filter on another sport only.
    await page.goto("/concours?quand=aujourdhui&places=1");
    await expect(page.locator(`a[href="/concours/${code}"]`)).toHaveCount(0);
  });
});
