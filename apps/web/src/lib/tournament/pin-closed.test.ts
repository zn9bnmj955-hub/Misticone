import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Lot 2, T5: after the closing (archived) the scoring table no longer opens with a PIN. */

const PIN = "4821";
let row = { id: "t-1", short_code: "7KQ2", status: "archived" };
let pinCookie: string | undefined;
const rateLimit = vi.fn(async () => true);

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (pinCookie ? { value: pinCookie } : undefined) }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: async () => ({ data: null }) } }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const q = { select: () => q, eq: () => q, neq: () => q, maybeSingle: async () => ({ data: { id: "staff-1", label: "Table 1", revoked_at: null } }) };
    return { rpc: async (_: string, a: { p_pin: string }) => ({ data: a.p_pin === PIN ? "staff-1" : null }), from: () => q };
  },
}));
vi.mock("@/lib/tournament/http", async (orig) => ({
  ...(await orig<typeof import("@/lib/tournament/http")>()),
  findTournamentRow: async () => row,
  rateLimit,
  rateLimited: async () => false,
}));

const { POST } = await import("@/app/api/t/[code]/pin/route");
const { getStaffActor, signPinSession } = await import("./staff");
const login = (pin: string) =>
  POST(new NextRequest("http://localhost/api/t/7KQ2/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) }), {
    params: Promise.resolve({ code: "7KQ2" }),
  });

beforeEach(() => {
  process.env.STAFF_SESSION_SECRET = "test-secret-0123456789";
  rateLimit.mockClear();
  pinCookie = undefined;
});

describe("PIN after the closing", () => {
  it("finished (not closed): the right PIN still opens the table", async () => {
    row = { ...row, status: "finished" };
    const res = await login(PIN);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/^os_pin_7KQ2=/);
  });

  it("closed: even the right PIN is refused (403 TOURNAMENT_ARCHIVED), no cookie, not counted as a failure", async () => {
    row = { ...row, status: "archived" };
    const res = await login(PIN);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "TOURNAMENT_ARCHIVED" } });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("a PIN session opened before the closing stops working once closed", async () => {
    pinCookie = (await signPinSession("t-1", "staff-1")).value;
    expect(await getStaffActor({ id: "t-1", short_code: "7KQ2", status: "finished" })).toMatchObject({ kind: "pin", staffId: "staff-1" });
    expect(await getStaffActor({ id: "t-1", short_code: "7KQ2", status: "archived" })).toBeNull();
  });
});
