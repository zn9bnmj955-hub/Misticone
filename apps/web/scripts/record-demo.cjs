/**
 * Records the demo walk-through of docs/DEMO.md as two videos (computer and
 * phone) into docs/demo/. The site must run on http://localhost:3000 with
 * fresh demo data (pnpm db:reset). Run from apps/web:
 *   node scripts/record-demo.cjs
 * Each step is independent: a step that fails is skipped, the recording goes on.
 */
const { chromium } = require("@playwright/test");
const { mkdirSync, readdirSync, renameSync, rmSync } = require("node:fs");
const path = require("node:path");

const BASE = process.env.DEMO_URL || "http://localhost:3000";
const OUT = path.resolve(__dirname, "../../../docs/demo");
const pause = (page, ms) => page.waitForTimeout(ms);

async function step(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}: ${String(e.message || e).split("\n")[0]}`);
  }
}

async function scrollThrough(page, distance, steps = 8) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, distance / steps);
    await pause(page, 350);
  }
}

async function signIn(page, email) {
  await page.goto(`${BASE}/connexion`);
  await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe").fill("orgasport-demo");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("**/accueil");
}

async function walkThrough(page, phone) {
  await step("accueil 3D", async () => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await pause(page, 5000);
    await page.getByRole("button", { name: "Football" }).first().click();
    await pause(page, 3000);
    await page.getByRole("button", { name: "Pétanque" }).first().click();
    await pause(page, 2500);
    await scrollThrough(page, phone ? 2400 : 1600);
    await pause(page, 1500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await pause(page, 1500);
  });
  await step("retrouver mon tirage", async () => {
    await page.getByPlaceholder(/7KQ2/).first().fill("7KQ2");
    await pause(page, 600);
    await page.getByRole("button", { name: /Voir/ }).first().click();
    await page.waitForURL(/\/c\/7KQ2/);
    await pause(page, 1500);
    await page.getByLabel("Trouver mon équipe").fill("14");
    await page.getByRole("button", { name: "OK" }).click();
    await pause(page, 4000);
    await scrollThrough(page, 900, 5);
    await pause(page, 1500);
  });
  await step("table de marque : score puis annulation", async () => {
    await page.goto(`${BASE}/c/7KQ2/table`);
    await page.getByLabel("Code PIN").fill("4821");
    await page.getByRole("button", { name: "Ouvrir la table de marque" }).click();
    await page.getByRole("button", { name: /Scores/ }).first().click();
    await pause(page, 1500);
    await page.locator("#quick-score").pressSequentially("12 13 7", { delay: 180 });
    await pause(page, 600);
    await page.keyboard.press("Enter");
    await pause(page, 2500);
    await page.goto(`${BASE}/c/7KQ2?equipe=14`);
    await pause(page, 3500);
    await page.goto(`${BASE}/c/7KQ2/table`);
    await page.getByRole("button", { name: /Historique/ }).first().click();
    await pause(page, 2000);
    await page.getByRole("button", { name: /Annuler/ }).first().click();
    await pause(page, 2500);
  });
  await step("club : créer et payer un concours", async () => {
    await signIn(page, "club@demo.orgasport.fr");
    await page.goto(`${BASE}/club`);
    await pause(page, 2500);
    await page.goto(`${BASE}/club/concours/nouveau`);
    await page.getByRole("button", { name: /Pétanque/ }).first().click();
    await page.waitForURL(/modifier/);
    await pause(page, 1500);
    await page.getByRole("button", { name: "Continuer" }).first().click();
    await page.getByLabel("Nom du concours").pressSequentially("Grand Prix de démonstration", { delay: 60 });
    await pause(page, 800);
    await page.getByRole("button", { name: /Tout le reste par défaut/ }).first().click();
    const pay = page.getByRole("button", { name: /Payer .* et publier/ });
    await pay.waitFor({ state: "visible", timeout: 20000 });
    await pause(page, 2500);
    await scrollThrough(page, 1200, 5);
    await pay.click();
    await page.waitForURL(/\/paiement\/simulation\//, { timeout: 30000 });
    await pause(page, 2000);
    await page.getByRole("button", { name: /^Payer/ }).click();
    await page.getByRole("heading", { name: "C'est en ligne !" }).waitFor({ timeout: 30000 });
    await pause(page, 4000);
    await scrollThrough(page, 800, 4);
  });
  await step("catalogue et inscription", async () => {
    await page.goto(`${BASE}/concours`);
    await pause(page, 3000);
    await scrollThrough(page, 900, 5);
    await page.goto(`${BASE}/concours/GP3M`);
    await pause(page, 3000);
    await scrollThrough(page, 1200, 6);
    await page.goto(`${BASE}/c/GP3M/inscription`);
    await pause(page, 3000);
  });
  await step("fil du joueur", async () => {
    await page.context().clearCookies();
    await signIn(page, "joueur@demo.orgasport.fr");
    await pause(page, 3500);
    await scrollThrough(page, 1500, 7);
    await pause(page, 1000);
  });
  await step("assistant", async () => {
    await page.goto(`${BASE}/assistant`);
    await pause(page, 2000);
    await page.getByRole("button", { name: /La règle du but à 13/ }).first().click();
    await pause(page, 7000);
  });
  await step("vidéos", async () => {
    await page.goto(`${BASE}/decouvrir`);
    await pause(page, 3000);
    await scrollThrough(page, 900, 4);
    await pause(page, 1500);
  });
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [name, options, phone] of [
    ["demo-ordinateur", { viewport: { width: 1440, height: 900 } }, false],
    ["demo-telephone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, true],
  ]) {
    console.log(name);
    const dir = path.join(OUT, `.tmp-${name}`);
    rmSync(dir, { recursive: true, force: true });
    const context = await browser.newContext({ ...options, locale: "fr-FR", recordVideo: { dir, size: options.viewport } });
    const page = await context.newPage();
    await walkThrough(page, phone);
    await context.close();
    const file = readdirSync(dir).find((f) => f.endsWith(".webm"));
    renameSync(path.join(dir, file), path.join(OUT, `${name}.webm`));
    rmSync(dir, { recursive: true, force: true });
  }
  await browser.close();
})();
