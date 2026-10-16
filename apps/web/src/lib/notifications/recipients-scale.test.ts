import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Notifications of a 512-team tournament against a fake PostgREST that behaves like Supabase:
 * responses capped at max_rows = 1000, `.in()` with more than ~200 uuids fails (414 URI Too Long).
 * Every team must still get its notification.
 */
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
let upserted: Row[] = [];

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let range: [number, number] | null = null;
  let tooLong = false;
  const teamOf = (r: Row) => db.teams!.find((t) => t.id === r.team_id);
  const run = () => {
    if (tooLong) return { data: null, error: { code: "414", message: "URI Too Long" } };
    let rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (range) rows = rows.slice(range[0], range[1] + 1);
    if (table === "push_targets") rows = rows.map((r) => ({ ...r, push_subscriptions: null }));
    return { data: rows.slice(0, 1000), error: null };
  };
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => (filters.push((r) => (col.startsWith("teams.") ? teamOf(r)?.[col.slice(6)] : r[col]) === v), q),
    in: (col: string, list: unknown[]) => ((tooLong ||= list.length > 200), filters.push((r) => list.includes(r[col])), q),
    not: (col: string) => (filters.push((r) => r[col] != null), q),
    gte: () => q,
    lte: () => q,
    order: () => q,
    range: (a: number, b: number) => ((range = [a, b]), q),
    upsert: async (rows: Row[]) => {
      upserted.push(...rows);
      return { error: null, count: rows.length };
    },
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve().then(run).then(ok, ko),
  };
  return q;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: query, auth: { admin: { getUserById: async () => ({ data: { user: null } }) } } }) }));
const { queueScheduledNotifications } = await import("./server");

const id = (p: string, i: number) => `${p}-${String(i).padStart(5, "0")}`;
const NOW = Date.parse("2026-06-13T07:45:00Z");

beforeEach(() => {
  upserted = [];
  const teams = Array.from({ length: 512 }, (_, i) => ({ id: id("t", i + 1), tournament_id: "T", number: i + 1, status: "checked_in" }));
  db.tournaments = [
    { id: "T", short_code: "BIG1", name: "Grand concours", sport_slug: "petanque", starts_at: new Date(NOW + 15 * 60_000).toISOString(), checkin_closes_at: null, address: null, city: null, config: {}, status: "published" },
  ];
  db.teams = teams;
  // 512 triplettes: 1 536 players, one account each (more than max_rows and far more than an URL can hold).
  db.players = teams.flatMap((t, i) => [1, 2, 3].map((p) => ({ id: id("p", i * 3 + p), team_id: t.id, user_id: id("u", i * 3 + p) })));
  db.push_targets = [];
  db.registrations = [];
  db.push_subscriptions = db.players.map((p, i) => ({ id: id("s", i + 1), endpoint: `https://push.example/${i}`, p256dh: "k", auth: "a", user_id: p.user_id }));
  db.profiles = db.players.map((p) => ({ id: p.user_id, notifications_opt_in: true }));
});

describe("notifications on a 512-triplette tournament", () => {
  it("queues the 'starting soon' push for every player of every team (no 414, no truncation)", async () => {
    await queueScheduledNotifications(NOW);
    const push = upserted.filter((r) => r.channel === "push" && r.template === "tournament_starting");
    expect(push).toHaveLength(1536);
    expect(new Set(push.map((r) => r.team_id)).size).toBe(512);
  });
});
