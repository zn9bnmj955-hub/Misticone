import { describe, expect, it, vi } from "vitest";

const calls: { fn: string; args: unknown }[] = [];
let reply: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => (calls.push({ fn, args }), reply),
  }),
}));

const { purgeExpiredTournaments } = await import("./purge");

describe("purgeExpiredTournaments", () => {
  it("calls the SQL purge with the given time and returns the purged codes", async () => {
    reply = { data: ["AAAA", null], error: null };
    const now = Date.parse("2026-10-16T12:00:00.000Z");
    expect(await purgeExpiredTournaments(now)).toEqual(["AAAA"]);
    expect(calls).toEqual([{ fn: "purge_finished_tournaments", args: { p_now: "2026-10-16T12:00:00.000Z" } }]);
  });

  it("reports a database error instead of hiding it", async () => {
    reply = { data: null, error: new Error("boom") };
    await expect(purgeExpiredTournaments()).rejects.toThrow("boom");
  });
});
