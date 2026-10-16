import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 8 — accessibility: axe (WCAG 2.1 A/AA + 2.2 AA target size) on every
 * main page in light and dark, no horizontal scroll at 360 px, and keyboard
 * use (visible focus, Escape closes dialogs). No rule is excluded.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type Who = "guest" | "joueur" | "club" | "admin" | "pin";
const PAGES: Record<Who, string[]> = {
  guest: ["/", "/decouvrir", "/concours", "/concours/GP3M", "/connexion", "/inscription/joueur", "/tirage", "/c/7KQ2", "/c/7KQ2?equipe=1", "/c/7KQ2/affiche"],
  joueur: ["/accueil", "/profil", "/assistant"],
  club: ["/club", "/club/concours/nouveau"],
  admin: ["/admin"],
  pin: ["/c/7KQ2/table"],
};

async function signIn(page: Page, who: Who) {
  if (who === "guest") return;
  if (who === "pin") {
    await page.request.post("/api/t/7KQ2/pin", { data: { pin: "4821" } });
    return;
  }
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Se connecter avec un mot de passe" }).click();
  await page.getByLabel("Adresse email").fill(`${who}@demo.orgasport.fr`);
  await page.getByLabel("Mot de passe").fill("orgasport-demo");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL("**/accueil");
}

/** Short, readable list of violations: "rule ×count: first targets". */
async function axeViolations(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return r.violations.map((v) => `${v.id} ×${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

/** Tab `count` times; every focused element must show a visible focus indicator. */
async function tabAndCheckFocus(page: Page, count: number) {
  const probe = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el.tagName === "NEXTJS-PORTAL") return null; // the dev overlay is not part of the site
      const s = getComputedStyle(el);
      const after = getComputedStyle(el, "::after");
      const visible =
        (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
        (after.outlineStyle !== "none" && parseFloat(after.outlineWidth) > 0) ||
        s.boxShadow !== "none";
      const name = `${location.pathname} ${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") ?? el.getAttribute("placeholder") ?? el.textContent ?? "").trim().slice(0, 30)}`;
      return { name, visible };
    });
  let seen = 0;
  for (let i = 0; i < count; i++) {
    await page.keyboard.press("Tab");
    const first = await probe();
    if (!first) continue;
    seen++;
    // Reduced motion keeps a 0.01 ms transition: poll until the outline has settled.
    await expect.poll(async () => (await probe())?.visible ?? true, { message: `focus not visible on ${first.name}`, timeout: 2000 }).toBe(true);
  }
  expect(seen).toBeGreaterThan(0);
}

for (const scheme of ["light", "dark"] as const) {
  for (const who of Object.keys(PAGES) as Who[]) {
    test.describe(`axe ${scheme} · ${who}`, () => {
      test.use({ colorScheme: scheme, viewport: { width: 360, height: 740 }, contextOptions: { reducedMotion: "reduce" } });
      test(`no violation and no horizontal scroll at 360 px`, async ({ page }) => {
        test.setTimeout(240_000);
        await signIn(page, who);
        const problems: string[] = [];
        for (const path of PAGES[who]) {
          await page.goto(path, { waitUntil: "networkidle", timeout: 90_000 });
          for (const v of await axeViolations(page)) problems.push(`${path}: ${v}`);
          const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
          if (sw > cw) problems.push(`${path}: horizontal scroll ${sw} > ${cw}`);
        }
        expect(problems, problems.join("\n")).toEqual([]);
      });
    });
  }
}

test.describe("keyboard", () => {
  test.use({ viewport: { width: 1280, height: 900 }, contextOptions: { reducedMotion: "reduce" } });

  test("landing and catalog filters: visible focus in a logical order", async ({ page }) => {
    await page.goto("/");
    await tabAndCheckFocus(page, 8);
    await page.goto("/concours");
    await tabAndCheckFocus(page, 12);
  });

  test("QR scanner dialog: focus moves in, Escape closes and focus returns", async ({ page }) => {
    await page.goto("/tirage");
    const scan = page.getByRole("button", { name: /scanner/i }).first();
    await scan.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(scan).toBeFocused();
  });

  test("wizard first step and scoring table: visible focus", async ({ page }) => {
    await signIn(page, "club");
    await page.goto("/club/concours/nouveau");
    await expect(page.getByRole("button", { name: "Créer le concours" })).toBeVisible();
    await tabAndCheckFocus(page, 10);
    await signIn(page, "pin");
    await page.goto("/c/7KQ2/table");
    // The table is a client app: wait until it has rendered, then go to score entry.
    await page.getByRole("navigation", { name: "Table de marque" }).getByRole("button", { name: /Scores/ }).click();
    await tabAndCheckFocus(page, 15);
  });
});
