import { expect, test } from "@playwright/test";

/** Live refreshes may be shared a few seconds at the CDN, but never served to a phone that carries its team cookie. */
test.describe("public live refresh cache", () => {
  test("?fragment=1 without team cookie: short CDN cache, varies on the team cookie", async ({ request }) => {
    const res = await request.get("/c/7KQ2?fragment=1");
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h["cache-control"]).toBe("public, max-age=0, s-maxage=4, stale-while-revalidate=4");
    expect(h["netlify-vary"]).toBe("cookie=os_t_7KQ2");
    expect(h["vary"]).toMatch(/\bCookie\b/);
  });

  test("?fragment=1 with the team cookie os_t_CODE: no-store", async ({ request }) => {
    const res = await request.get("/c/7KQ2?fragment=1", { headers: { cookie: "os_t_7KQ2=3" } });
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h["cache-control"]).toBe("no-store");
    expect(h["netlify-vary"]).toBe("cookie=os_t_7KQ2");
    expect(h["vary"]).toMatch(/\bCookie\b/);
  });
});
