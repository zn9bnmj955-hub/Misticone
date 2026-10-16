import { expect, test } from "@playwright/test";

// K2: when a tournament has no active PIN, the access tab offers a single
// "table PIN" first; creating it gives the printable volunteer sheet.
// TR8E (demo, finished) has no PIN: the PIN created here is revoked at the end.
test("access tab: single table PIN offered when none is active, then printable", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
  await page.getByLabel("Adresse email").fill("club@demo.orgasport.fr");
  await page.getByLabel("Mot de passe").fill("orgasport-demo");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("**/accueil");
  await page.goto("/c/TR8E/table");
  await expect(page.getByText("En ligne")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Accès$/ }).click();

  const offer = page.getByRole("button", { name: "Créer le PIN de la table" });
  await expect(offer).toBeVisible();
  await offer.click();
  const created = page.getByText(/Code PIN pour Table de marque : \d{6}/);
  await expect(created).toBeVisible();
  // Once a PIN exists the offer disappears; the sheet can be printed right away.
  await expect(offer).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Imprimer la fiche à donner/ })).toBeVisible();

  // Tidy up: revoke it, so the demo stays without a PIN on TR8E.
  const row = page.getByRole("listitem").filter({ hasText: "Table de marque" }).last();
  await row.getByRole("button", { name: "Retirer l'accès" }).click();
  await expect(row).toContainText("retiré");
});
