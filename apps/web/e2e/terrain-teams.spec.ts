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
