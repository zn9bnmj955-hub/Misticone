import { expect, test, type Page } from "@playwright/test";

// F2: the "Tirage" step offers the cadrage, the concours B (with its sign-up
// and fee) and C, and the 2-day pause, all prefilled by the sport; the
// summary repeats them. Phone width first (360 px), no horizontal scroll.

async function signIn(page: Page) {
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
  await page.getByLabel("Adresse email").fill("club@demo.orgasport.fr");
  await page.getByLabel("Mot de passe").fill("orgasport-demo");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("**/accueil");
}

test("draw step: cadrage, concours B and C, 2 days (phone)", async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page);
  await page.goto("/club/concours/nouveau");
  await page.getByRole("button", { name: "Créer le concours" }).click();
  await page.waitForURL(/\/club\/concours\/[0-9a-f-]+\/modifier/);
  await page.goto(`${page.url().split("?")[0]}?etape=draw`);

  // Prefilled by the pétanque: cadrage after the 1st game, automatic B, no C, one day.
  await expect(page.getByRole("radio", { name: /Après la 1re partie/ })).toBeChecked();
  await expect(page.getByRole("switch", { name: /Concours B/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /^Automatique/ })).toBeChecked();
  // C, B fee and 2 days are folded behind "Plus d'options" (F3).
  await expect(page.getByRole("switch", { name: /Concours C/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Plus d'options/ }).click();
  await expect(page.getByRole("switch", { name: /Concours C/ })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "Sur 1 jour" })).toBeChecked();
  await expect(page.getByLabel("Droit d'inscription au B (€)")).toHaveCount(0);

  // B on sign-up with a fee, C, pause before the 1/8.
  await page.getByRole("radio", { name: /^Sur inscription/ }).check({ force: true });
  await page.getByLabel("Droit d'inscription au B (€)").fill("5");
  await page.locator("label", { has: page.getByRole("switch", { name: /Concours C/ }) }).click();
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/modifier"), { timeout: 15_000 });
  await page.locator("label", { has: page.getByRole("radio", { name: "Pause avant les 1/8" }) }).click();
  await expect(page.getByRole("radio", { name: "Pause après les poules" })).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Options already used stay open when the screen comes back.
  await saved;
  await page.reload();
  await expect(page.getByRole("switch", { name: /Concours C/ })).toBeChecked({ timeout: 15_000 });
  await page.screenshot({ path: info.outputPath("draw-step-phone.png"), fullPage: true });

  // The summary repeats the choices.
  await page.goto(`${page.url().split("?")[0]}?etape=summary`);
  await expect(page.getByText(/Concours B, Sur inscription, 5\s€ d'inscription · Concours C/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Pause avant les 1/8")).toBeVisible();
});
