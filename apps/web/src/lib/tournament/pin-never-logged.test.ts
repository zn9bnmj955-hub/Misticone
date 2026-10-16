import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// K2 acceptance: "the PIN is never in a URL nor in the logs". The browser side
// (addresses requested) is covered by e2e/volunteer-sheet.spec.ts; here the two
// server routes that handle a PIN in clear (creation, then login) are run with
// every console method watched: nothing they print, and no response header
// (cookie included), may contain the PIN.

const PIN = "482193";
const TOURNAMENT = { id: "t-1", short_code: "7KQ2" };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: { p_pin?: string }) => {
      if (name === "hash_pin") return { data: `hash(${args.p_pin!.length})`, error: null };
      if (name === "verify_staff_pin") return { data: args.p_pin === PIN ? "staff-1" : null, error: null };
      return { data: null, error: null };
    },
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: "staff-1", label: "Table de marque" }, error: null }) }) }),
    }),
  }),
}));
vi.mock("@/lib/tournament/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tournament/http")>()),
  findTournamentRow: async () => TOURNAMENT,
  rateLimit: async () => true,
  rateLimited: async () => false,
  requireStaff: async () => ({
    ok: true,
    tournament: TOURNAMENT,
    actor: { kind: "account", userId: "u-1", staffId: null, label: "Club", canManageAccess: true },
  }),
}));

const ctx = { params: Promise.resolve({ code: "7KQ2" }) };
const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

let spies: MockInstance[] = [];
const printed = () => spies.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(" "))).join("\n");
const headersText = (res: Response) => [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");

beforeEach(() => {
  process.env.STAFF_SESSION_SECRET = "test-secret-0123456789";
  spies = (["log", "info", "warn", "error", "debug", "trace"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => vi.restoreAllMocks());

describe("PIN never in the server logs nor in an address (K2)", () => {
  it("creating a PIN returns it once in the body, never in a log or a header", async () => {
    const values = new Uint32Array([1_482_193]);
    vi.spyOn(crypto, "getRandomValues").mockImplementation(((a: Uint32Array) => {
      a.set(values);
      return a;
    }) as typeof crypto.getRandomValues);
    const { POST } = await import("@/app/api/t/[code]/staff/route");
    const res = await POST(post("/api/t/7KQ2/staff", { label: "Table de marque" }), ctx);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { pin: string }).pin).toBe(PIN);
    expect(headersText(res)).not.toContain(PIN);
    expect(printed()).not.toContain(PIN);
  });

  it("logging in with the PIN sets a signed cookie that does not contain it, and prints nothing with it", async () => {
    const { POST } = await import("@/app/api/t/[code]/pin/route");
    const ok = await POST(post("/api/t/7KQ2/pin", { pin: PIN }), ctx);
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^os_pin_7KQ2=/);
    expect(cookie).not.toContain(PIN);
    expect(Buffer.from(cookie.split("=")[1]!.split(".")[0]!, "base64url").toString("utf8")).not.toContain(PIN);
    expect(headersText(ok)).not.toContain(PIN);

    const wrong = await POST(post("/api/t/7KQ2/pin", { pin: "999999" }), ctx);
    expect(wrong.status).toBe(401);
    expect(headersText(wrong)).not.toContain("999999");
    expect(printed()).not.toContain(PIN);
    expect(printed()).not.toContain("999999");
  });
});
