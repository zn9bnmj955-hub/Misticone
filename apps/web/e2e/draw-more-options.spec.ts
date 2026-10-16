import { expect, test, type Page } from "@playwright/test";

// F3: the advanced options of the "Tirage" step (C, B fee, 2 days) are folded
// behind "Plus d'options", but an option in error is never hidden: when the
// organiser folded them and a later choice makes the pause invalid,
// "Continuer" opens them again on the message to fix.

async function signIn(page: Page) {
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
  await page.getByLabel("Adresse email").fill("club@demo.orgasport.fr");
  await page.getByLabel("Mot de passe").fill("orgasport-demo");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("**/accueil");
}

test("draw step: folded options open again when one is in error", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page);
  await page.goto("/club/concours/nouveau");
  await page.getByRole("button", { name: "Créer le concours" }).click();
  await page.waitForURL(/\/club\/concours\/[0-9a-f-]+\/modifier/);
  await page.goto(`${page.url().split("?")[0]}?etape=general`);
  // The name first, as on the normal path (the cross-field rules run on a named form).
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/modifier"), { timeout: 15_000 });
  await page.getByLabel("Nom du concours").fill("Concours plié");
  await saved;
  await page.goto(`${page.url().split("?")[0]}?etape=draw`);

  const pauseAfterPools = page.getByRole("radio", { name: "Pause après les poules" });
  const message = page.getByText("La pause après les poules demande un concours en poules.");

  // Pools, then a pause after the pools (an advanced option).
  await page.getByRole("radio", { name: /Poules puis phase finale/ }).click();
  await page.getByRole("button", { name: /Plus d'options/ }).click();
  await page.locator("label", { has: pauseAfterPools }).click();
  await expect(pauseAfterPools).toBeChecked();

  // Folded by hand: the pause is out of sight.
  await page.getByRole("button", { name: /Moins d'options/ }).click();
  await expect(page.getByRole("radio", { name: "Sur 1 jour" })).toHaveCount(0);

  // Back to a plain elimination: the pause after the pools no longer fits.
  // Nothing is shouted before "Continuer"; the options stay folded.
  await page.getByRole("radio", { name: /Élimination directe/ }).click();
  await expect(page.getByRole("button", { name: /Plus d'options/ })).toHaveAttribute("aria-expanded", "false");
  await expect(message).toHaveCount(0);

  // "Continuer" is refused and opens the options on the error.
  const title = ((await page.locator('h1[tabindex="-1"]').textContent()) ?? "").trim();
  await page.getByRole("button", { name: "Continuer" }).first().click();
  await expect(message.first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Moins d'options/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('h1[tabindex="-1"]')).toHaveText(title);

  // Fixed in place: the next screen opens.
  await page.locator("label", { has: page.getByRole("radio", { name: "Sur 1 jour" }) }).click();
  await expect(message).toHaveCount(0);
  await page.getByRole("button", { name: "Continuer" }).first().click();
  await expect(page.locator('h1[tabindex="-1"]')).not.toHaveText(title);
});

test("draw step: a B fee already set keeps the options open when the screen comes back", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page);
  await page.goto("/club/concours/nouveau");
  await page.getByRole("button", { name: "Créer le concours" }).click();
  await page.waitForURL(/\/club\/concours\/[0-9a-f-]+\/modifier/);
  const base = page.url().split("?")[0];
  await page.goto(`${base}?etape=general`);
  let saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/modifier"), { timeout: 15_000 });
  await page.getByLabel("Nom du concours").fill("Concours droit B");
  await saved;
  await page.goto(`${base}?etape=draw`);

  const fee = page.getByLabel("Droit d'inscription au B (€)");
  const more = page.getByRole("button", { name: /Plus d'options|Moins d'options/ });

  // B on sign-up: the fee is an advanced option, folded at first.
  await page.locator("label", { has: page.getByRole("radio", { name: /^Sur inscription/ }) }).click();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(fee).toHaveCount(0);
  await more.click();
  saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/modifier"), { timeout: 15_000 });
  await fee.fill("5");
  await fee.blur();
  await saved;

  // Back on the screen later: a fee is set, so the options are open and show it.
  await page.goto(`${base}?etape=venues`);
  await page.goto(`${base}?etape=draw`);
  await expect(fee).toHaveValue("5", { timeout: 15_000 });
  await expect(more).toHaveAttribute("aria-expanded", "true");
});
