import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3 — a club creates and pays (test mode) a tournament with the
 * default settings in less than 3 minutes, and it goes online by itself.
 * Without a Stripe key the local "simulated payment" goes through the same
 * signed webhook as Stripe.
 */

async function signIn(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe").fill("orgasport-demo");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("**/accueil");
}

test.describe("club space", () => {
  test("create and pay a tournament with the default settings in under 3 minutes", async ({ page }) => {
    test.setTimeout(180_000);
    const started = Date.now();
    const name = `Concours e2e ${started.toString(36)}`;
    await signIn(page, "club@demo.orgasport.fr");

    await page.goto("/club/concours/nouveau");
    await page.getByRole("button", { name: /Pétanque/ }).first().click();
    await page.waitForURL(/\/club\/concours\/[0-9a-f-]+\/modifier/);

    // Only the name is missing from the defaults: step 2, then straight to the summary.
    await page.getByRole("button", { name: "Continuer" }).first().click();
    await page.getByLabel("Nom du concours").fill(name);
    await page.getByRole("button", { name: /Tout le reste par défaut/ }).first().click();
    const pay = page.getByRole("button", { name: /Payer .* et publier/ });
    await expect(pay).toBeEnabled({ timeout: 20_000 });
    await pay.click();

    // Simulated hosted checkout (same signed webhook as Stripe).
    await page.waitForURL(/\/paiement\/simulation\//, { timeout: 30_000 });
    await expect(page.getByText(/Paiement de test/).first()).toBeVisible();
    await page.getByRole("button", { name: /^Payer/ }).click();

    await page.waitForURL(/\/club\/concours\/[0-9a-f-]+\/paiement/, { timeout: 30_000 });
    await expect(page.getByText("C'est en ligne !")).toBeVisible({ timeout: 30_000 });
    expect(Date.now() - started).toBeLessThan(180_000);

    // Published: short link, public page and catalog.
    const link = await page.locator('a[href^="/c/"]').first().getAttribute("href");
    const code = /\/c\/([2-9A-HJKMNP-Z]{4,6})/.exec(link ?? "")?.[1];
    expect(code).toBeTruthy();
    const pub = await page.request.get(`/c/${code}`);
    expect(pub.ok()).toBe(true);
    expect(await pub.text()).toContain(name.replace(/'/g, "&#39;"));
    await page.goto("/concours");
    await expect(page.getByText(name)).toBeVisible();
  });

  test("a 100 % promo code publishes without payment", async ({ page }) => {
    test.setTimeout(120_000);
    const name = `Concours offert ${Date.now().toString(36)}`;
    await signIn(page, "club@demo.orgasport.fr");
    await page.goto("/club/concours/nouveau");
    await page.getByRole("button", { name: /Pétanque/ }).first().click();
    await page.waitForURL(/modifier/);
    await page.getByRole("button", { name: "Continuer" }).first().click();
    await page.getByLabel("Nom du concours").fill(name);
    await page.getByRole("button", { name: /Tout le reste par défaut/ }).first().click();
    await expect(page.getByRole("button", { name: /Payer .* et publier/ })).toBeEnabled({ timeout: 20_000 });
    await page.getByLabel(/Code promo/).fill("bienvenue");
    await page.getByRole("button", { name: /Appliquer/ }).click();
    const free = page.getByRole("button", { name: "Publier gratuitement" });
    await expect(free).toBeEnabled({ timeout: 20_000 });
    await free.click();
    await expect(page.getByText("C'est en ligne !")).toBeVisible({ timeout: 30_000 });
  });

  test("the webhook refuses unsigned events", async ({ request }) => {
    const res = await request.post("/api/stripe/webhook", {
      data: { type: "checkout.session.completed", data: { object: { id: "cs_fake" } } },
      headers: { "stripe-signature": "t=1,v1=bad" },
    });
    expect(res.status()).toBe(400);
  });
});
