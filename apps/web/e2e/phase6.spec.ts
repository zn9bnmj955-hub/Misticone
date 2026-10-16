import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 6 — AI assistant. Without an API key (local and CI) the assistant
 * answers from the knowledge base: the same streamed route, the same chips.
 */

async function signIn(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe").fill("orgasport-demo");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("**/accueil");
}

test.describe("assistant", () => {
  test("a guest asks a starter question and gets a streamed answer with suggestions", async ({ page }) => {
    await page.goto("/assistant");
    await page.getByRole("list", { name: "Exemples de questions" }).getByRole("button", { name: "Que dit le règlement sur le but ?" }).click();

    const conversation = page.getByRole("list", { name: "Conversation avec l'assistant" });
    await expect(conversation).toContainText("Que dit le règlement sur le but ?");
    await expect(conversation).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
    await expect(conversation.getByRole("listitem").last()).toContainText(/\S{20,}|13/);
    await expect(page.getByRole("list", { name: "Questions suggérées" }).getByRole("button").first()).toBeVisible();
  });

  test("an off-topic question is refused politely, with sport and site suggestions", async ({ page }) => {
    await page.goto("/assistant");
    await page.getByLabel("Votre question").fill("Pour qui voter à l'élection présidentielle ?");
    await page.getByRole("button", { name: "Envoyer" }).click();
    const conversation = page.getByRole("list", { name: "Conversation avec l'assistant" });
    await expect(conversation).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
    await expect(conversation.getByRole("listitem").last()).toContainText("questions de sport et sur le site OrgaSport");
    await expect(page.getByRole("list", { name: "Questions suggérées" }).getByRole("button", { name: "Comment marche le PIN des bénévoles ?" })).toBeVisible();
  });

  test("the admin sees usage, adds a knowledge document, finds it, then deletes it", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin@demo.orgasport.fr");
    await page.goto("/admin/assistant");
    await expect(page.getByRole("heading", { name: "Utilisation et coûts" })).toBeVisible({ timeout: 30_000 });

    const stamp = Date.now().toString(36);
    const title = `Test e2e ${stamp}`;
    const word = `zorbiflette${stamp}`;

    const create = page.locator('[aria-labelledby="admin-ai-kb-new"]');
    await create.getByLabel("Titre").fill(title);
    await create.getByRole("textbox", { name: /^Texte/ }).fill(`Le ${word} se joue en doublette sur un terrain de pétanque.`);
    await create.getByRole("button", { name: "Enregistrer" }).click();
    await expect(create.getByRole("status")).toHaveText("Document enregistré.", { timeout: 20_000 });

    const docs = page.getByRole("list", { name: "Documents" });
    const item = docs.getByRole("listitem").filter({ hasText: title });
    await expect(item).toBeVisible();

    const search = page.getByRole("search", { name: "Tester une question" });
    await search.getByLabel("Question").fill(word);
    await search.getByRole("button", { name: "Chercher" }).click();
    await expect(search.getByRole("status")).toHaveText(/paragraphes? trouvés?/, { timeout: 20_000 });
    await expect(page.getByText(word, { exact: false }).first()).toBeVisible();

    await item.getByText("Supprimer", { exact: true }).click();
    await item.getByRole("button", { name: "Supprimer définitivement ce document" }).click();
    await expect(docs.getByRole("listitem").filter({ hasText: title })).toHaveCount(0, { timeout: 20_000 });
  });
});
