import { expect, test, type APIRequestContext } from "@playwright/test";

// Lot 2, T5: public pages of a finished tournament, then of a closed one.
// TR8E (demo) is finished 3 days ago; it is closed (archived) only for the second
// test and put back to "finished" at the end (far from the 14-day purge).
// Read from apps/web/.env.local (loaded by playwright.config.ts): no key in the code.
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";
const ORIGIN = { origin: "http://localhost:3000" };

// The real closing goes through the engine (tournament.close), which bumps
// state_version; the public page caches the state per version, so do the same.
async function setStatus(request: APIRequestContext, status: "finished" | "archived") {
  const headers = { apikey: SECRET, authorization: `Bearer ${SECRET}`, "content-type": "application/json" };
  const url = `${SUPABASE}/rest/v1/tournaments?short_code=eq.TR8E`;
  const [{ state_version }] = (await (await request.get(`${url}&select=state_version`, { headers })).json()) as { state_version: number }[];
  const res = await request.patch(url, { headers: { ...headers, prefer: "return=minimal" }, data: { status, state_version: state_version + 1 } });
  expect(res.ok(), await res.text()).toBe(true);
}

const postScore = (request: APIRequestContext) =>
  request.post("/c/TR8E/score", { headers: ORIGIN, form: { team: "1", code: "1234", a: "13", b: "5" }, maxRedirects: 0 });
const postRegistration = (request: APIRequestContext) =>
  request.post("/c/TR8E/inscription", { headers: ORIGIN, form: { name: "Équipe test", contact_email: "t@example.org" } });

test.describe.configure({ mode: "serial" });

test("finished: banner, no captain form, score and registration refused without error", async ({ page, request }) => {
  await page.goto("/c/TR8E");
  const banner = page.locator("#termine");
  await expect(banner).toContainText("Concours terminé");
  await expect(banner).not.toContainText("Lien clôturé");
  await expect(banner).toContainText("Vainqueur");
  await expect(page.locator("form.score-form")).toHaveCount(0);

  const score = await postScore(request);
  expect(score.status()).toBe(303);
  expect(score.headers().location).toContain("msg=ended");
  await page.goto(score.headers().location!);
  await expect(page.locator("p.msg.err")).toContainText("terminé");

  const reg = await postRegistration(request);
  expect(reg.status()).toBe(409);
  expect(await reg.text()).toContain("Ce concours est terminé");
});

test("closed: « Lien clôturé » everywhere, PIN refused, scoring table closed", async ({ page, request }) => {
  await setStatus(request, "archived");
  try {
    await page.goto("/c/TR8E");
    await expect(page.locator("#termine")).toContainText("Concours terminé · Lien clôturé");

    const score = await postScore(request);
    expect(score.status()).toBe(303);
    expect(score.headers().location).toContain("msg=closed");

    const reg = await postRegistration(request);
    expect(reg.status()).toBe(409);
    expect(await reg.text()).toContain("Lien clôturé");

    const pin = await request.post("/api/t/TR8E/pin", { data: { pin: "000000" } });
    expect(pin.status()).toBe(403);
    expect(await pin.json()).toEqual({ error: { code: "TOURNAMENT_ARCHIVED" } });

    await page.goto("/c/TR8E/table");
    await expect(page.getByRole("heading", { name: "Lien clôturé" })).toBeVisible();
    await expect(page.getByLabel("Code PIN")).toHaveCount(0);
  } finally {
    await setStatus(request, "finished");
  }
});
