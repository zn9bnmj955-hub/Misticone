import { expect, test, type Locator, type Page } from "@playwright/test";

// F3: a complete competition (doublette, no pools, automatic B, C, over
// 2 days) is created up to the payment in 25 interactions or fewer, by the
// natural path (every screen, "Continuer"), on a phone.
//
// Measured on the same path (interactions = clicks + fields typed):
//   before F3: start screen + 8 steps, 12 interactions; a sport question with
//              a single answer on step 2; every option of the "Tirage" step
//              always open (C, B fee, pause: 9 groups on one screen).
//   after  F3: start screen + 8 steps, 13 interactions (+1 "Plus d'options");
//              no sport question when one sport only; the "Tirage" step opens
//              on format, cadrage and B, the rest folded (7 groups).
// Only the competition name is required: everything else is prefilled.

const MAX_INTERACTIONS = 25;
const MAX_MS = 5 * 60_000;

async function signIn(page: Page) {
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
  await page.getByLabel("Adresse email").fill("club@demo.orgasport.fr");
  await page.getByLabel("Mot de passe").fill("orgasport-demo");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("**/accueil");
}

test("create a full competition up to the payment in 25 interactions or fewer", async ({ page }, info) => {
  test.setTimeout(MAX_MS);
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page);

  let interactions = 0;
  const click = async (l: Locator) => {
    interactions++;
    await l.click();
  };
  const fill = async (l: Locator, value: string) => {
    interactions++;
    await l.fill(value);
  };
  const toggle = async (l: Locator) => {
    interactions++;
    // Like a person: tap the visible row (the native input is visually hidden).
    await page.locator("label", { has: l }).click();
    await expect(l).toBeChecked();
  };
  const screens: string[] = [];
  const heading = async () => {
    // The step title (focused on each new screen); wait until the screen has changed.
    const h = page.locator('h1[tabindex="-1"]');
    if (screens.length) await expect(h).not.toHaveText(screens[screens.length - 1]!);
    await expect(h).toBeVisible();
    screens.push((await h.innerText()).trim());
  };
  const cont = () => click(page.getByRole("button", { name: "Continuer" }).first());

  const started = Date.now();
  const name = `Concours express ${Date.now().toString(36)}`;
  await page.goto("/club/concours/nouveau");
  await click(page.getByRole("button", { name: "Créer le concours" }));
  await page.waitForURL(/\/club\/concours\/[0-9a-f-]+\/modifier/);

  // 1. Team: prefilled from the account.
  await heading();
  await cont();

  // 2. General: one sport only, so no sport choice; the name is the only thing to type.
  await heading();
  await expect(page.getByRole("radiogroup", { name: "Sport" })).toHaveCount(0);
  await expect(page.getByText(/foot/i)).toHaveCount(0);
  await fill(page.getByLabel("Nom du concours"), name);
  await cont();

  // 3. Participants: doublette by default.
  await heading();
  await expect(page.getByRole("radio", { name: /Doublette/ })).toBeChecked();
  await cont();

  // 4. Money.
  await heading();
  await cont();

  // 5. Draw: elimination without pools and automatic B by default;
  //    C and the 2-day pause sit behind "Plus d'options".
  await heading();
  await expect(page.getByRole("switch", { name: /Concours B/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /^Automatique/ })).toBeChecked();
  await expect(page.getByRole("switch", { name: /Concours C/ })).toBeHidden();
  await click(page.getByRole("button", { name: /Plus d'options/ }));
  await toggle(page.getByRole("switch", { name: /Concours C/ }));
  await toggle(page.getByRole("radio", { name: "Pause avant les 1/8" }));
  await page.screenshot({ path: info.outputPath("draw-more-options.png"), fullPage: true });
  await cont();

  // 6. Venues, 7. Communication.
  await heading();
  await cont();
  await heading();
  await cont();

  // 8. Summary: everything repeated, then pay.
  await heading();
  await expect(page.getByText(/Concours B, Automatique.*Concours C/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Pause avant les 1/8")).toBeVisible();
  const pay = page.getByRole("button", { name: /Payer .* et publier/ });
  await expect(pay).toBeEnabled({ timeout: 20_000 });
  await click(pay);
  await page.waitForURL(/\/paiement\/simulation\//, { timeout: 30_000 });

  const elapsed = Date.now() - started;
  info.annotations.push({ type: "wizard", description: `${screens.length} screens, ${interactions} interactions, ${Math.round(elapsed / 1000)} s: ${screens.join(" > ")}` });
  console.log(`[F3] ${screens.length} écrans, ${interactions} interactions, ${Math.round(elapsed / 1000)} s`);
  expect(interactions).toBeLessThanOrEqual(MAX_INTERACTIONS);
  expect(elapsed).toBeLessThan(MAX_MS);
});
