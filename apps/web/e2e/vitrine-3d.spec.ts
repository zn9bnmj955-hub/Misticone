import { expect, test, type Page } from "@playwright/test";

/**
 * Landing 3D scene: a still page must give a still picture (no shimmer, no
 * blinking neon, no camera tremor), and the frame rate must stay steady.
 * Only the ball turns: it is masked out of the comparison.
 */

async function open3D(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  const hero = page.locator("section[data-ball]").first();
  await expect(hero).toHaveAttribute("data-ball", /^(3d|static)$/, { timeout: 15_000 });
  return hero;
}

test.describe("landing 3D", () => {
  test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });

  test("the floor and the décor do not move or blink on a still page (10 s)", async ({ page }) => {
    test.setTimeout(90_000);
    const hero = await open3D(page);
    if ((await hero.getAttribute("data-ball")) !== "3d") test.skip(true, "no WebGL 2 on this machine: static scene only");
    await expect(page.locator("canvas[data-ball-canvas][data-ready]")).toHaveCount(1);
    await page.waitForTimeout(1500); // fade-in of the canvas and entrance animations

    const mask = [page.locator(".ld-ballSpot")];
    const shot = () => hero.screenshot({ mask, animations: "disabled", caret: "hide" });
    const first = await shot();
    const started = Date.now();
    let frames = 1;
    while (Date.now() - started < 10_000) {
      const next = await shot();
      frames++;
      expect(next.equals(first), `image ${frames} differs from the first one`).toBe(true);
      await page.waitForTimeout(250);
    }
    expect(frames).toBeGreaterThanOrEqual(4);
  });

  test("the frame rate stays steady", async ({ page }) => {
    const hero = await open3D(page);
    if ((await hero.getAttribute("data-ball")) !== "3d") test.skip(true, "no WebGL 2 on this machine: static scene only");
    await page.waitForTimeout(1000);
    const intervals = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const out: number[] = [];
          let prev = performance.now();
          const end = prev + 3000;
          const tick = (now: number) => {
            out.push(now - prev);
            prev = now;
            if (now < end) requestAnimationFrame(tick);
            else resolve(out.slice(5));
          };
          requestAnimationFrame(tick);
        }),
    );
    const sorted = [...intervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    console.log(`3D hero: ${(1000 / median).toFixed(0)} i/s median, p95 interval ${p95.toFixed(1)} ms`);
    // Steady: few long frames compared with the usual one (machine-independent).
    expect(p95).toBeLessThan(median * 3 + 8);
  });
});
