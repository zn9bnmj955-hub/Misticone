import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 5 — the personalized home feed and the « À vous ! » notifications.
 * Real push delivery needs the browser vendors' push services (not
 * reachable here): the browser side is mocked, the server side is real.
 */

async function signIn(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe").fill("orgasport-demo");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("**/accueil");
}

/** A browser where push "works": permission asked on click, fake subscription. */
const MOCK_PUSH = (endpoint: string) => `
  (() => {
    let permission = "default";
    Object.defineProperty(Notification, "permission", { get: () => permission });
    Notification.requestPermission = (cb) => {
      permission = "granted";
      window.__permissionAsked = (window.__permissionAsked || 0) + 1;
      if (cb) cb(permission);
      return Promise.resolve(permission);
    };
    let sub = null;
    const subscription = {
      endpoint: ${JSON.stringify(endpoint)},
      toJSON: () => ({ endpoint: ${JSON.stringify(endpoint)}, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } }),
      unsubscribe: () => { sub = null; return Promise.resolve(true); },
    };
    const reg = { pushManager: { getSubscription: () => Promise.resolve(sub), subscribe: () => { sub = subscription; return Promise.resolve(sub); } } };
    const sw = { register: () => Promise.resolve(reg), ready: Promise.resolve(reg), getRegistration: () => Promise.resolve(reg), controller: null, addEventListener() {} };
    Object.defineProperty(navigator, "serviceWorker", { get: () => sw });
  })();
`;

test.describe("feed and notifications", () => {
  test("the player's home: pinned next match, then the feed", async ({ page }) => {
    await signIn(page, "joueur@demo.orgasport.fr");
    await expect(page.getByRole("link", { name: /En direct/ }).first()).toBeVisible();
    // Feed items of several kinds, newest results and news included (demo data).
    await expect(page.getByText("Résultat", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Actualité", { exact: true }).first()).toBeVisible();
    // News open the source site in a new tab, never inside OrgaSport.
    const news = page.locator('a[href^="https://example.org/demo/"]').first();
    await expect(news).toHaveAttribute("target", "_blank");
    await expect(news).toHaveAttribute("rel", /noopener/);
  });

  test("a guest is offered « À vous ! » on the team page, asked only on click", async ({ browser }) => {
    const endpoint = `https://push.example/orgasport-e2e-${Date.now().toString(36)}`;
    const context = await browser.newContext();
    await context.addInitScript(MOCK_PUSH(endpoint));
    const page = await context.newPage();
    await page.goto("/c/7KQ2?equipe=14");
    const button = page.getByRole("button", { name: /Me prévenir/ });
    await expect(button).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __permissionAsked?: number }).__permissionAsked ?? 0)).toBe(0);

    const saved = page.waitForResponse((r) => r.url().endsWith("/api/push/subscribe") && r.request().method() === "POST");
    await button.click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText(/Vous serez prévenu·e/)).toBeVisible();

    // The profile lists the followed team on this device, and stops it.
    await page.goto("/profil");
    await expect(page.getByText(/7KQ2/).first()).toBeVisible();
    const removed = page.waitForResponse((r) => r.url().endsWith("/api/push/subscribe") && r.request().method() === "DELETE");
    await page.getByRole("button", { name: "Désactiver sur cet appareil" }).click();
    expect((await removed).status()).toBe(200);
    await context.close();
  });

  test("the app can be installed: manifest and icons", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect((await request.get(manifest.icons[0].src)).ok()).toBe(true);
    const terrain = await (await request.get("/c/7KQ2")).text();
    expect(terrain).toContain('rel="manifest" href="/terrain.webmanifest"');
  });
});
