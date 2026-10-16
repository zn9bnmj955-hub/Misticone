import { expect, test } from "@playwright/test";
import jsQR from "jsqr";

// K2: printable volunteer sheet (QR code + PIN), generated from the access tab.
// The sheet prints on one page, its QR code opens the PIN screen of the right
// tournament, and the PIN never appears in any address requested by the browser.
test("volunteer sheet: one page, QR to the PIN screen, PIN never in a URL", async ({ page, browser }, info) => {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  // Keep the print layout in place (headless print is a no-op that fires afterprint).
  await page.addInitScript(() => {
    window.print = () => {};
  });
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
  await page.getByLabel("Adresse email").fill("club@demo.orgasport.fr");
  await page.getByLabel("Mot de passe").fill("orgasport-demo");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("**/accueil");
  await page.goto("/c/7KQ2/table");
  await expect(page.getByText("En ligne")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^8\s*Accès$/ }).click();

  await page.getByLabel("Nom du bénévole").fill("Bénévole fiche");
  await page.getByRole("button", { name: "Créer un code PIN" }).click();
  const created = page.getByText(/Code PIN pour Bénévole fiche : \d{6}/);
  await expect(created).toBeVisible();
  const pin = (await created.textContent())!.match(/(\d{6})/)![1]!;

  await page.getByRole("button", { name: /Imprimer la fiche à donner/ }).click();
  const sheet = page.locator("[data-volunteer-sheet]");
  await expect(sheet).toContainText("Pour : Bénévole fiche");
  await expect(sheet.locator("[data-pin]")).toHaveText(`${pin.slice(0, 3)} ${pin.slice(3)}`);
  const qr = sheet.locator("img[data-qr]");
  await expect(qr).toHaveJSProperty("complete", true);

  // The QR code decodes to the scoring table of 7KQ2, without the PIN.
  const pixels = await qr.evaluate((img: HTMLImageElement) => {
    const c = document.createElement("canvas");
    c.width = c.height = 400;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 400, 400);
    ctx.drawImage(img, 20, 20, 360, 360);
    return Array.from(ctx.getImageData(0, 0, 400, 400).data);
  });
  const decoded = jsQR(Uint8ClampedArray.from(pixels), 400, 400);
  expect(decoded?.data).toMatch(/\/c\/7KQ2\/table$/);
  expect(decoded!.data).not.toContain(pin);

  // Printed on one A4 page (page.pdf ends the print layout: done last).
  await page.emulateMedia({ media: "print" });
  await expect(sheet).toBeVisible();
  await page.screenshot({ path: info.outputPath("volunteer-sheet.png"), fullPage: true });
  const pdf = await page.pdf({ format: "A4" });
  expect(pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g)?.length).toBe(1);
  await page.emulateMedia({ media: "screen" });

  // Scanning it on another phone opens the PIN screen, and the PIN opens the table.
  const volunteer = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const phone = await volunteer.newPage();
  phone.on("request", (r) => urls.push(r.url()));
  await phone.goto(new URL(decoded!.data).pathname);
  await phone.getByLabel("Code PIN").fill(pin);
  await phone.getByLabel("Code PIN").press("Enter");
  await expect(phone.getByText("En ligne")).toBeVisible({ timeout: 15_000 });
  await volunteer.close();

  // (built file names are content hashes: skipped to avoid a chance match with the 6 digits)
  for (const url of urls.filter((u) => !u.includes("/_next/static/"))) expect(url, url).not.toContain(pin);

  // Tidy up: revoke the PIN created by this test.
  const row = page.getByRole("listitem").filter({ hasText: "Bénévole fiche" }).last();
  await row.getByRole("button", { name: "Retirer l'accès" }).click();
  await expect(row).toContainText("retiré");
});
