import { expect, test, type Page } from "@playwright/test";

/**
 * Lot 2, P1 — pétanque only: football is switched off (`enabled: false` in
 * packages/sports, code kept). No visible page mentions football, even with
 * an old device cookie that still chose it.
 */

const FOOT = /\bfoot(ball)?\b|foot à/i;

async function signIn(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe").fill("orgasport-demo");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("**/accueil");
}

/** Old cookies from the time football was offered. */
async function footballCookies(page: Page, baseURL: string | undefined) {
  const url = baseURL ?? "http://localhost:3000";
  await page.context().addCookies([
    { name: "os_sport", value: "football", url },
    { name: "os_prefs", value: encodeURIComponent(JSON.stringify({ sports: ["football", "petanque"] })), url },
  ]);
}

async function expectNoFootball(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  // The requested URL itself is echoed in the router payload: it is not page content.
  const html = (await page.content()).split(path.split("?")[1] ?? "\u0000").join("");
  expect(html.match(FOOT)?.[0] ?? null, `${path} mentions football`).toBeNull();
}

test.describe("pétanque only", () => {
  test("public pages and onboarding never mention football", async ({ page, baseURL }) => {
    await footballCookies(page, baseURL);
    for (const path of ["/", "/accueil", "/concours", "/concours?sport=football", "/inscription/joueur", "/inscription/club", "/inscription/invite"]) {
      await expectNoFootball(page, path);
    }
    // The old os_sport=football cookie is brought back to pétanque: no football accent, no sport chips.
    await page.goto("/accueil");
    await expect(page.locator("html")).not.toHaveAttribute("data-sport", "football");
    await expect(page.getByRole("group", { name: "Filtrer par sport" })).toHaveCount(0);
  });

  test("« all sports » (no sport cookie) hides the football tournament still in the database", async ({ page, baseURL }) => {
    // FT8S (football, « Tournoi des fêtes des Platanes ») is still in the demo data until P2:
    // with no sport chosen, the catalog and the feed must only list the sports offered.
    const url = baseURL ?? "http://localhost:3000";
    await page.context().addCookies([{ name: "os_sport", value: "all", url }]);
    for (const path of ["/accueil", "/concours", "/concours?sport=all"]) {
      await expectNoFootball(page, path);
      await expect(page.getByText("Tournoi des fêtes des Platanes")).toHaveCount(0);
    }
    await page.context().clearCookies();
    await expectNoFootball(page, "/concours");
    await expect(page.getByText("Tournoi des fêtes des Platanes")).toHaveCount(0);
  });

  test("player profile never mentions football", async ({ page, baseURL }) => {
    await signIn(page, "joueur@demo.orgasport.fr");
    await footballCookies(page, baseURL);
    await expectNoFootball(page, "/profil");
    await expectNoFootball(page, "/accueil");
  });

  test("the tournament form starts without a sport choice", async ({ page, baseURL }) => {
    await signIn(page, "club@demo.orgasport.fr");
    await footballCookies(page, baseURL);
    await expectNoFootball(page, "/club/concours/nouveau");
    await page.getByRole("button", { name: "Créer le concours" }).click();
    await page.waitForURL(/\/club\/concours\/[0-9a-f-]+\/modifier/);
    await expectNoFootball(page, new URL(page.url()).pathname);
  });
  test("an old onboarding draft that chose football resumes on pétanque", async ({ page, baseURL }) => {
    // Draft saved on the device before football was switched off, resumed after a magic link.
    await page.goto("/");
    await page.evaluate(() =>
      localStorage.setItem("os_onboarding", JSON.stringify({ kind: "guest", step: "city", sports: ["football"] })),
    );
    await expectNoFootball(page, "/inscription/invite?reprendre=1");
    await expect(page.getByRole("heading", { name: "Votre ville" })).toBeVisible();
    await page.getByRole("button", { name: "Passer" }).click();
    await page.getByRole("button", { name: "C'est parti" }).click();
    await page.waitForURL("**/accueil");
    const cookies = await page.context().cookies(baseURL ?? "http://localhost:3000");
    expect(cookies.find((c) => c.name === "os_sport")?.value).toBe("petanque");
    await expect(page.locator("html")).toHaveAttribute("data-sport", "petanque");
  });
});
