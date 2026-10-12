import { chromium } from "@playwright/test";
const OUT = "/tmp/claude-0/-home-user-Misticone/d8809bca-f8e5-5d93-be23-d1b2191431c9/scratchpad/shots";
const browser = await chromium.launch();
const run = async (code, viewport, name) => {
  const ctx = await browser.newContext({ viewport, locale: "fr-FR" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("PAGEERROR " + String(e).slice(0, 200)));
  await page.goto(`http://localhost:3000/concours/${code}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  // scroll to the map to trigger lazy loading
  const map = page.locator("#acces");
  await map.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const leaflet = await page.locator(".leaflet-container").count();
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(name, "leaflet:", leaflet, "scrollWidth:", scrollW, "vw:", viewport.width, "errors:", JSON.stringify(errors));
  await ctx.close();
};
await run("GP3M", { width: 360, height: 780 }, "gp3m-mobile");
await run("GP3M", { width: 1280, height: 900 }, "gp3m-desktop");
await run("7KQ2", { width: 360, height: 780 }, "7kq2-mobile");
await run("FT8S", { width: 390, height: 844 }, "ft8s-mobile");
await run("TR8E", { width: 390, height: 844 }, "tr8e-mobile");
await browser.close();
