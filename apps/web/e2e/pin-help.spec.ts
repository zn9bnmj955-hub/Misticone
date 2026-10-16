import { expect, test, type Page } from "@playwright/test";

// K1: the volunteer PIN is explained where it is typed and where it is created,
// without horizontal overflow on a phone (360 px) or a computer.
const SIZES = [
  { name: "phone", width: 360, height: 780 },
  { name: "desktop", width: 1280, height: 900 },
];

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectHelp(page: Page, sentence: RegExp) {
  const help = page.getByRole("region", { name: "Le PIN, comment ça marche ?" });
  await expect(help).toBeVisible();
  await expect(help).toContainText(sentence);
  await expect(help.getByRole("list", { name: "En 3 étapes" }).getByRole("listitem")).toHaveText([/^1\s*Créer/, /^2\s*Donner/, /^3\s*Le bénévole saisit/]);
  return help;
}

for (const size of SIZES) {
  test(`PIN entry screen explains the PIN (${size.name})`, async ({ page }, info) => {
    await page.setViewportSize(size);
    await page.goto("/c/7KQ2/table");
    await expect(page.getByLabel("Code PIN")).toBeVisible();
    await expectHelp(page, /ce concours seulement, pendant 24 h, sur ce téléphone/);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath(`pin-entry-${size.name}.png`), fullPage: true });
  });

  test(`access tab explains the PIN to the organizer (${size.name})`, async ({ page }, info) => {
    await page.setViewportSize(size);
    await page.goto("/connexion");
    await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
    await page.getByLabel("Adresse email").fill("club@demo.orgasport.fr");
    await page.getByLabel("Mot de passe").fill("orgasport-demo");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await page.waitForURL("**/accueil");
    await page.goto("/c/7KQ2/table");
    await expect(page.getByText("En ligne")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^8\s*Accès$/ }).click();
    const help = await expectHelp(page, /Vous pouvez le révoquer à tout moment/);
    await expect(help).toContainText("/c/7KQ2/table");
    await expect(page.getByRole("button", { name: "Créer un code PIN" })).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath(`pin-access-${size.name}.png`), fullPage: true });
  });
}

test("club tournament page explains the PIN in the organizing team (phone)", async ({ page }, info) => {
  await page.setViewportSize(SIZES[0]);
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
  await page.getByLabel("Adresse email").fill("club@demo.orgasport.fr");
  await page.getByLabel("Mot de passe").fill("orgasport-demo");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("**/accueil");
  await page.goto("/club");
  await page.getByRole("link", { name: "Gérer", exact: true }).first().click();
  await page.waitForURL(/\/club\/concours\/[0-9a-f-]{36}$/);
  const help = await expectHelp(page, /Vous pouvez le révoquer à tout moment/);
  await expect(help).toContainText(/\/c\/[2-9A-Z]{4}\/table/);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath("pin-club-phone.png"), fullPage: true });
});
