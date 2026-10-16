import { expect, test } from "@playwright/test";

/** Landing ball: the engraved dark steel boule only (no football ball, no sport switch). */
test("the landing shows the ORGASPORT boule and never loads a football ball", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));
  await page.goto("/", { waitUntil: "networkidle" });
  const spot = page.getByRole("img", { name: /boule de pétanque.*ORGASPORT/ });
  await expect(spot).toBeVisible();
  await expect(spot.locator("img")).toHaveAttribute("src", "/vitrine/ball.webp");
  expect(await spot.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(560);
  await expect(page.locator("section[data-ball] [aria-pressed]")).toHaveCount(0);
  expect(requested.filter((u) => /football|ballon/i.test(u))).toEqual([]);
  const ball = await page.request.get("/vitrine/football.webp");
  expect(ball.status()).toBe(404);
});
