import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * loadTournament against a fake PostgREST that behaves like Supabase:
 * every response is capped at max_rows = 1000, and an `.in()` filter with
 * more than ~200 uuids fails (414 URI Too Long).
 */
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
let failTable: string | null = null;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let range: [number, number] | null = null;
  let tooLong = false;
  let ordered = false;
  const teamOf = (r: Row) => db.teams!.find((t) => t.id === r.team_id);
  const run = () => {
    if (tooLong) return { data: null, error: { code: "414", message: "URI Too Long" } };
    if (failTable === table) return { data: null, error: { message: `boom ${table}` } };
    let rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (range && !ordered) throw new Error(`unordered pagination on ${table}`);
    if (range) rows = rows.slice(range[0], range[1] + 1);
    return { data: rows.slice(0, 1000), error: null };
  };
  const q = {
    select: () => q,
    eq: (col: string, v: unknown) => (filters.push((r) => (col.startsWith("teams.") ? teamOf(r)?.[col.slice(6)] : r[col]) === v), q),
    neq: (col: string, v: unknown) => (filters.push((r) => r[col] !== v), q),
    in: (col: string, list: unknown[]) => ((tooLong ||= list.length > 200), filters.push((r) => list.includes(r[col])), q),
    not: (col: string) => (filters.push((r) => r[col] != null), q),
    order: () => ((ordered = true), q),
    range: (a: number, b: number) => ((range = [a, b]), q),
    maybeSingle: async () => {
      const r = run();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve().then(run).then(ok, ko),
  };
  return q;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: query }) }));
const { loadTournament } = await import("./load");

const id = (p: string, i: number) => `${p}-${String(i).padStart(5, "0")}`;

beforeEach(() => {
  failTable = null;
  const teams = Array.from({ length: 512 }, (_, i) => ({ id: id("t", i + 1), tournament_id: "T", number: i + 1, name: null, club_name: null, status: "checked_in", seed: null, bracket: "main", checked_in_at: null }));
  db.tournaments = [{ id: "T", short_code: "BIG1", status: "live", sport_slug: "petanque", team_format: "triplette", config: {}, starts_at: null, max_teams: 1024, state_version: 7, clubs: null }];
  db.teams = teams;
  db.players = teams.flatMap((t, i) => [1, 2, 3].map((p) => ({ id: id("p", i * 3 + p), team_id: t.id, first_name: "Prénom", last_name: `Nom${i + 1}`, position: p })));
  db.venues = [{ id: "v-1", tournament_id: "T", label: "1", position: 1, reserved_for_finals: false, available: true }];
  db.rounds = [{ id: "r-1", tournament_id: "T", bracket: "main", phase: "swiss", number: 1, status: "finished", seed: "s", drawn_at: null }];
  db.matches = Array.from({ length: 1280 }, (_, i) => ({ id: id("m", i + 1), tournament_id: "T", round_id: "r-1", position: i + 1, pool: null, team_a_id: teams[(2 * i) % 512]!.id, team_b_id: teams[(2 * i + 1) % 512]!.id, side_a: null, side_b: null, venue_id: null, status: "finished", score_a: 13, score_b: 5, winner_side: "a" }));
  db.registrations = [];
  db.team_secrets = [];
});

describe("loadTournament on a 512-triplette tournament", () => {
  it("reads all 1 536 players and 1 280 matches despite max_rows and the URL length limit", async () => {
    const loaded = await loadTournament("BIG1");
    expect(Object.keys(loaded!.state.teams)).toHaveLength(512);
    expect(Object.keys(loaded!.state.players)).toHaveLength(1536);
    expect(Object.keys(loaded!.state.matches)).toHaveLength(1280);
    expect(loaded!.state.players[id("p", 1536)]!.lastName).toBe("Nom512");
  });

  it("throws instead of building an incomplete state when a read fails", async () => {
    failTable = "players";
    await expect(loadTournament("BIG1")).rejects.toMatchObject({ message: "boom players" });
  });
});
