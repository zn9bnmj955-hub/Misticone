import { expect, test, type Page } from "@playwright/test";

const DEMO_PASSWORD = "orgasport-demo";

async function signIn(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("**/accueil");
}

test("landing shows the find-my-draw field first and works without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  const field = page.getByLabel("Code du concours");
  await expect(field).toBeVisible();
  await field.fill("7kq2");
  await page.getByRole("button", { name: "Voir" }).click();
  await expect(page).toHaveURL(/\/c\/7KQ2$/);
  // Phase 2 adds: the tournament page itself renders fully without JavaScript.
  await context.close();
});

test("unknown code shows a clear message", async ({ page }) => {
  await page.goto("/tirage");
  await page.getByLabel("Code du concours").fill("ZZZZ");
  await page.getByRole("button", { name: "Voir" }).click();
  await expect(page.getByRole("alert")).toContainText("Aucun concours ne correspond au code « ZZZZ »");
});

test("guest onboarding remembers sports on the device", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Sans compte/ }).click();
  // Pétanque is the only sport offered: the sport question is skipped.
  await expect(page.getByRole("heading", { name: "Votre ville" })).toBeVisible();
  await page.getByRole("button", { name: "Passer" }).click();
  await page.getByRole("button", { name: "C'est parti" }).click();
  await page.waitForURL("**/accueil");
  // Pétanque accent applied and only pétanque tournaments listed.
  await expect(page.locator("html")).toHaveAttribute("data-sport", "petanque");
  await expect(page.getByRole("heading", { name: "Grand Prix des Platanes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tournoi des fêtes des Platanes" })).toHaveCount(0);
  // Returning to "/" now lands on the feed.
  await page.goto("/");
  await expect(page).toHaveURL(/\/accueil$/);
});

test("player onboarding creates an account and a personalized home", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/inscription/joueur");
  await page.getByRole("radio", { name: /En loisir/ }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("radio", { name: /Non, pas de licence/ }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Passer" }).click(); // city
  await page.getByRole("button", { name: "Continuer" }).click(); // feed (defaults)
  await page.getByRole("radio", { name: /Pas maintenant/ }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Créez votre compte" })).toBeVisible();
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe").fill("motdepasse-solide");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.getByRole("button", { name: "C'est parti" }).click();
  await page.waitForURL("**/accueil");
  await expect(page.locator("html")).toHaveAttribute("data-sport", "petanque");
  await expect(page.getByRole("heading", { name: "Grand Prix des Platanes" })).toBeVisible();
});

test("a player in a live tournament reaches the next match in one tap", async ({ page }) => {
  await signIn(page, "joueur@demo.orgasport.fr");
  // Pinned live card on the home feed.
  await expect(page.getByText("Votre prochain match")).toBeVisible();
  const start = Date.now();
  await page.getByRole("link", { name: "Mon tirage" }).click();
  await page.waitForURL(/\/c\/7KQ2\?equipe=14/);
  await expect(page.locator("#mon-equipe")).toContainText("À vous ! contre l'équipe");
  await expect(page.locator("#mon-equipe .v").first()).toHaveText("12");
  expect(Date.now() - start).toBeLessThan(10_000);
});

test("club account switches between player and club profiles", async ({ page }) => {
  await signIn(page, "club@demo.orgasport.fr");
  // Club mode: "Mon club" tab and the club's tournaments first.
  await expect(page.getByRole("link", { name: "Mon club" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vos concours" })).toBeVisible();
  await page.getByRole("link", { name: "Profil" }).click();
  await page.getByRole("button", { name: /Profil joueur/ }).click();
  await page.waitForURL("**/accueil");
  await expect(page.getByRole("link", { name: "Mon club" })).toHaveCount(0);
  // Switch back so the demo account stays in club mode.
  await page.getByRole("link", { name: "Profil" }).click();
  await page.getByRole("button", { name: /Gérer AS Les Platanes/ }).click();
  await page.waitForURL("**/accueil");
  await expect(page.getByRole("link", { name: "Mon club" })).toBeVisible();
});

test("club onboarding creates the club and opens club mode", async ({ page }) => {
  const email = `club-${Date.now()}@example.com`;
  await page.goto("/inscription/club");
  await page.getByLabel("Nom du club ou de l'association").fill("Amicale bouliste des Tests");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("radio", { name: /Comité des fêtes/ }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  // Club sports: skipped, pétanque is the only sport offered.
  await page.getByRole("button", { name: "Passer" }).click(); // federation
  await page.getByRole("button", { name: "Passer" }).click(); // address
  await page.getByLabel("Nom du responsable").fill("Camille Test");
  await page.getByRole("button", { name: "Continuer" }).click();
  // Account is required for a club: no skip button here.
  await expect(page.getByRole("button", { name: "Continuer sans compte" })).toHaveCount(0);
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe").fill("motdepasse-solide");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("heading", { name: "Ajoutez votre logo" })).toBeVisible();
  await page.getByRole("button", { name: "Passer" }).click();
  await page.getByRole("button", { name: "C'est parti" }).click();
  await page.waitForURL("**/accueil");
  await expect(page.getByRole("link", { name: "Mon club" })).toBeVisible();
  await page.getByRole("link", { name: "Mon club" }).click();
  await expect(page.getByText("Amicale bouliste des Tests")).toBeVisible();
});

test("magic link signs the person in", async ({ page, request }) => {
  const email = `magic-${Date.now()}@example.com`;
  await page.goto("/connexion");
  await page.getByLabel("Adresse email").fill(email);
  await page.getByRole("button", { name: "Recevoir un lien de connexion" }).click();
  await expect(page.getByRole("status")).toContainText(email);

  // Read the email from the local Mailpit inbox started by Supabase.
  let link: string | undefined;
  for (let i = 0; i < 20 && !link; i++) {
    const res = await request.get(`http://127.0.0.1:54324/api/v1/search?query=to:${encodeURIComponent(email)}`);
    const json = (await res.json()) as { messages?: { ID: string }[] };
    const id = json.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await request.get(`http://127.0.0.1:54324/api/v1/message/${id}`)).json()) as { HTML: string; Text: string };
      link = (msg.Text.match(/https?:\/\/\S+/) ?? [])[0]?.replace(/&amp;/g, "&");
    } else {
      await page.waitForTimeout(500);
    }
  }
  expect(link).toBeTruthy();
  await page.goto(link!);
  await page.waitForURL("**/accueil");
  await page.getByRole("link", { name: "Profil" }).click();
  await expect(page.getByText(email).filter({ visible: true }).first()).toBeVisible();
});
