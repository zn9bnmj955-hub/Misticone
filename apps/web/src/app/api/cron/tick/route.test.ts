import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// B3: the minute task runs the purge after the closure, so a tournament finished long ago
// is closed then purged in the same run; without the secret nothing runs.
const calls: string[] = [];
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/tournament/staff", () => ({ getStaffActor: async () => null }));
vi.mock("@/lib/notifications/server", () => ({
  queueScheduledNotifications: async () => (calls.push("queue"), 0),
  dispatchQueued: async () => (calls.push("dispatch"), 0),
}));
vi.mock("@/lib/tournament/auto-draw", () => ({ processDueDraws: async () => (calls.push("draw"), []) }));
vi.mock("@/lib/tournament/auto-close", () => ({ closeExpiredTournaments: async () => (calls.push("close"), ["OLD1"]) }));
vi.mock("@/lib/tournament/purge", () => ({ purgeExpiredTournaments: async () => (calls.push("purge"), ["OLD1", "OLD2"]) }));

const { GET } = await import("./route");
const req = (auth?: string) =>
  new NextRequest("http://localhost/api/cron/tick", { headers: auth ? { authorization: auth } : {} });

describe("GET /api/cron/tick (B3 purge)", () => {
  beforeEach(() => {
    calls.length = 0;
    process.env.CRON_SECRET = "s3cret";
  });

  it("purges after closing and returns the purged codes", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.closed).toEqual(["OLD1"]);
    expect(body.purged).toEqual(["OLD1", "OLD2"]);
    expect(calls.indexOf("purge")).toBeGreaterThan(calls.indexOf("close"));
    expect(calls.filter((c) => c === "purge")).toHaveLength(1);
  });

  it("runs nothing, purge included, without the right secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer undefined"))).status).toBe(401);
    expect(calls).toEqual([]);
  });
});
