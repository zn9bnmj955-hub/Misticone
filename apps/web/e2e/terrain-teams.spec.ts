import { expect, test } from "@playwright/test";

/** Lot 2, T3: « Résultats par équipes » (/c/CODE/equipes), plain HTML, public data only. */

test("« Résultats par équipes » works without JavaScript, one anchor per team, no private data", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  await page.goto("/c/7KQ2/equipes");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(/^Résultats par équipes \(\d+ équipes\)$/);
  await expect(page.getByText("Ctrl+F pour chercher une équipe, F5 pour actualiser la page.")).toBeVisible();
  // Alphabetical order of the first player, one anchor per team (#e14), status and path.
  const firsts = await page.locator("table.teams tbody tr td:nth-child(2) > b").evaluateAll((els) => els.map((e) => (e.innerHTML.split("<br>")[0] ?? "").trim()));
  expect(firsts.length).toBeGreaterThan(20);
  expect(firsts).toEqual([...firsts].sort((a, b) => a.localeCompare(b, "fr")));
  const row = page.locator("tr#e14");
  await expect(row).toContainText(/Concours [AB] : /);
  await expect(row).toContainText("1re partie : ");
  await page.goto("/c/7KQ2/equipes#e14");
  await expect(row).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  // Back to the draw.
  await page.getByRole("link", { name: "Retour au tirage" }).first().click();
  await expect(page).toHaveURL(/\/c\/7KQ2$/);
  await context.close();

  const res = await request.get("/c/7KQ2/equipes");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body.length).toBeLessThan(100 * 1024);
  const content = body.replace(/<style>[\s\S]*?<\/style>/, "");
  // No email, phone or licence number (8 digits) — clubs have 7-digit numbers.
  expect(content).not.toMatch(/@[a-z0-9-]+\./i);
  expect(content).not.toMatch(/\b0[67](\s?\d{2}){4}\b/);
  expect(content).not.toMatch(/\b\d{8}\b/);
  expect(content).not.toContain("<form");
});

test("before the draw the page is the list of registered teams: an online registration appears without its contacts", async ({ request, baseURL }) => {
  // A tournament open to online registration, not drawn yet.
  const catalog = await (await request.get("/concours?places=1")).text();
  const code = /href="\/c\/([2-9A-HJKMNP-Z]{4,6})\/inscription"/.exec(catalog)?.[1];
  expect(code, "an open tournament in the catalog").toBeTruthy();
  const last = `Inscrit${Date.now().toString(36)}`;
  const reg = await request.post(`/c/${code}/inscription`, {
    headers: { Origin: baseURL ?? "http://localhost:3000" },
    form: {
      p0_prenom: "Léa", p0_nom: last, p1_prenom: "Paul", p1_nom: last, cap_nom: `Léa ${last}`,
      cap_tel: "06 98 76 54 32", cap_email: `${last.toLowerCase()}@exemple.fr`, reglement: "on", coequipiers: "on",
    },
    maxRedirects: 0,
  });
  expect(reg.status()).toBe(303);
  const number = Number(/equipe=(\d+)/.exec(reg.headers()["location"] ?? "")?.[1]);
  expect(number).toBeGreaterThan(0);

  const res = await request.get(`/c/${code}/equipes`);
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain("<h2>Liste des inscrits ");
  expect(body).not.toContain("<th>Parcours</th>");
  const row = new RegExp(`<tr id="e${number}">.*?</tr>`).exec(body)?.[0] ?? "";
  expect(row).toContain("Inscrite");
  // The captain's contacts never reach the public page.
  expect(body).not.toContain("98 76 54 32");
  expect(body).not.toContain("0698765432");
  expect(body).not.toContain("@exemple.fr");
  expect(body).not.toContain("<script src");

  // Short code in lower case: permanent redirect; unknown code: back to the draw page.
  const lower = await request.get(`/c/${code!.toLowerCase()}/equipes`, { maxRedirects: 0 });
  expect(lower.status()).toBe(301);
  expect(lower.headers()["location"]).toMatch(new RegExp(`/c/${code}/equipes$`));
  const unknown = await request.get("/c/ZZZZ/equipes", { maxRedirects: 0 });
  expect(unknown.status()).toBe(303);
});
