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

  test("after a pointer move the camera settles to a still picture, and hand tremor changes nothing", async ({ page }) => {
    test.setTimeout(120_000);
    const hero = await open3D(page);
    if ((await hero.getAttribute("data-ball")) !== "3d") test.skip(true, "no WebGL 2 on this machine: static scene only");
    await expect(page.locator("canvas[data-ball-canvas][data-ready]")).toHaveCount(1);
    await page.waitForTimeout(1500);

    const mask = [page.locator(".ld-ballSpot")];
    const shot = () => hero.screenshot({ mask, animations: "disabled", caret: "hide" });
    const before = await shot();

    // A real move, far from the ball (which can be dragged): the décor follows the pointer...
    await page.mouse.move(100, 700, { steps: 5 });
    await page.waitForTimeout(800);
    expect((await shot()).equals(before), "the camera follows a real pointer move").toBe(false);

    // ...then really stops (no sub-pixel drift): two identical pictures in a row.
    let prev = await shot();
    let settled = false;
    const started = Date.now();
    while (Date.now() - started < 60_000) {
      await page.waitForTimeout(500);
      const next = await shot();
      if (next.equals(prev)) { settled = true; break; }
      prev = next;
    }
    expect(settled, "the camera comes to a complete stop").toBe(true);

    // Tremor: moves of a few pixels (inside the dead zone) leave the picture untouched.
    for (const [x, y] of [[102, 701], [99, 698], [101, 702], [100, 700]]) await page.mouse.move(x, y);
    await page.waitForTimeout(1500);
    for (let i = 0; i < 3; i++) {
      expect((await shot()).equals(prev), `image ${i + 1} after tiny pointer moves`).toBe(true);
      await page.waitForTimeout(500);
    }
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

test.describe("landing 3D stays off the critical path", () => {
  test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });

  test("the largest paint happens before the 3D canvas is mounted, and is never the canvas", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __lcp: { t: number; tag: string }[]; __canvasAt: number | null };
      w.__lcp = [];
      w.__canvasAt = null;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { element?: Element | null })[])
          w.__lcp.push({ t: e.startTime, tag: e.element?.tagName ?? "" });
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new MutationObserver(() => {
        if (w.__canvasAt === null && document.querySelector("canvas[data-ball-canvas]")) w.__canvasAt = performance.now();
      }).observe(document, { childList: true, subtree: true });
    });
    const hero = await open3D(page);
    if ((await hero.getAttribute("data-ball")) !== "3d") test.skip(true, "no WebGL 2 on this machine: static scene only");
    const { lcp, canvasAt } = await page.evaluate(() => {
      const w = window as unknown as { __lcp: { t: number; tag: string }[]; __canvasAt: number | null };
      return { lcp: w.__lcp, canvasAt: w.__canvasAt };
    });
    expect(lcp.length, "a largest contentful paint is reported").toBeGreaterThan(0);
    expect(canvasAt, "the 3D canvas was mounted").not.toBeNull();
    const last = lcp[lcp.length - 1];
    console.log(`landing LCP ${last.t.toFixed(0)} ms (${last.tag}), 3D canvas mounted at ${canvasAt!.toFixed(0)} ms`);
    expect(last.tag).not.toBe("CANVAS");
    // The 3D is loaded only once the page is idle: it can never delay the largest paint.
    expect(lcp[0].t).toBeLessThan(canvasAt!);
  });
});
