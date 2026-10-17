import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Demo data (P2): pétanque only, a « Cadrage » with places « d'office »,
 * concours B and C, teams of one club and « N.H. » teams, a two-day tournament
 * on pause. Reads the demo database with the service key (from apps/web/.env.local).
 */

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";
const headers = { apikey: SECRET, authorization: `Bearer ${SECRET}` };

async function rest<T>(request: APIRequestContext, path: string): Promise<T> {
  const res = await request.get(`${SUPABASE}/rest/v1/${path}`, { headers });
  expect(res.ok()).toBe(true);
  return (await res.json()) as T;
}

type Round = { id: string; bracket: string; number: number; matches: { team_b_id: string | null; side_b: string[] | null }[] };

async function rounds(request: APIRequestContext, code: string): Promise<Round[]> {
  const [t] = await rest<{ id: string }[]>(request, `tournaments?short_code=eq.${code}&select=id`);
  return rest<Round[]>(request, `rounds?tournament_id=eq.${t!.id}&select=id,bracket,number,matches(team_b_id,side_b)&order=bracket,number`);
}

const singles = (r: Round) => r.matches.filter((m) => !m.team_b_id && !m.side_b?.length).length;

test.describe("demo data", () => {
  test("every demo tournament is pétanque, FT8S is gone", async ({ request }) => {
    const rows = await rest<{ short_code: string | null; sport_slug: string }[]>(request, "tournaments?select=short_code,sport_slug");
    expect(rows.every((r) => r.sport_slug === "petanque")).toBe(true);
    const codes = rows.map((r) => r.short_code);
    for (const code of ["7KQ2", "GP3M", "TR8E", "C4DR", "2J7P", "PQ8P"]) expect(codes).toContain(code);
    expect(codes).not.toContain("FT8S");
  });

  test("7KQ2: 1st game with one exempt, then a cadrage (7 parties + 1 d'office) and the B", async ({ request }) => {
    const rs = await rounds(request, "7KQ2");
    const main = rs.filter((r) => r.bracket === "main");
    expect(main.map((r) => [r.matches.length, singles(r)])).toEqual([
      [15, 1],
      [8, 1],
    ]);
    expect(rs.find((r) => r.bracket === "consolation" && r.number === 1)?.matches.length).toBe(7);
    const html = await (await request.get("/c/7KQ2")).text();
    expect(html).toContain("Cadrage");
  });

  test("7KQ2: 32 doublettes, 3 absent at the check-in (forfeit), 29 checked in", async ({ request }) => {
    const [t] = await rest<{ id: string; team_format: string }[]>(request, "tournaments?short_code=eq.7KQ2&select=id,team_format");
    expect(t!.team_format).toBe("doublette");
    const teams = await rest<{ status: string; checked_in_at: string | null }[]>(request, `teams?tournament_id=eq.${t!.id}&select=status,checked_in_at`);
    expect(teams).toHaveLength(32);
    const absent = teams.filter((x) => !x.checked_in_at);
    expect(absent).toHaveLength(3);
    expect(absent.every((x) => x.status === "forfeit")).toBe(true);
  });

  test("PQ8P: 8 triplettes in pools (drawn later by the automatic-draw e2e)", async ({ request }) => {
    const [t] = await rest<{ id: string; team_format: string; config: { format: string } }[]>(request, "tournaments?short_code=eq.PQ8P&select=id,team_format,config");
    expect(t!.config.format).toBe("pools_then_bracket");
    expect(t!.team_format).toBe("triplette");
    expect(await rest<unknown[]>(request, `teams?tournament_id=eq.${t!.id}&select=id`)).toHaveLength(8);
  });

  test("7KQ2: teams of one club and « N.H. » teams (players' clubs)", async ({ request }) => {
    const [t] = await rest<{ id: string }[]>(request, "tournaments?short_code=eq.7KQ2&select=id");
    const teams = await rest<{ id: string; club_name: string | null; players: { club_number: string | null }[] }[]>(
      request,
      `teams?tournament_id=eq.${t!.id}&select=id,club_name,players(club_number)`,
    );
    const clubsOf = (x: (typeof teams)[number]) => new Set(x.players.map((p) => p.club_number));
    const nh = teams.filter((x) => x.players.every((p) => p.club_number) && clubsOf(x).size > 1);
    const homogeneous = teams.filter((x) => x.players.every((p) => p.club_number) && clubsOf(x).size === 1);
    expect(nh.length).toBeGreaterThan(0);
    expect(homogeneous.length).toBeGreaterThan(0);
    // N.H.: no team club (no « même club évité » constraint); one club: the club's name.
    expect(nh.every((x) => x.club_name === null)).toBe(true);
    expect(homogeneous.every((x) => x.club_name)).toBe(true);
  });

  test("the public pages show the cadrage, « Office », « (N.H.) » and the concours C", async ({ request }) => {
    const kq = await (await request.get("/c/7KQ2")).text();
    expect(kq).toContain("Résultats Cadrage");
    expect(kq).toContain("Office");
    expect(kq).toContain("(N.H.)");
    expect(kq).toContain("Concours B");
    const c4 = await (await request.get("/c/C4DR")).text();
    for (const text of ["Concours A", "Concours B", "Concours C", "Office"]) expect(c4, text).toContain(text);
  });

  test("C4DR: finished with a cadrage in the A, the B and the C", async ({ request }) => {
    const rs = await rounds(request, "C4DR");
    for (const bracket of ["main", "consolation", "consolation_c"]) {
      expect(rs.some((r) => r.bracket === bracket && singles(r) > 0 && r.number > 1), bracket).toBe(true);
    }
    expect((await request.get("/c/C4DR")).ok()).toBe(true);
  });

  test("2J7P: two-day tournament, live and on pause before the 1/4 de finale", async ({ request }) => {
    const [t] = await rest<{ status: string }[]>(request, "tournaments?short_code=eq.2J7P&select=status");
    expect(t!.status).toBe("live");
    const main = (await rounds(request, "2J7P")).filter((r) => r.bracket === "main");
    // 1st game, then the cadrage (4 parties + 4 d'office): the 1/4 are not drawn.
    expect(main.map((r) => [r.matches.length, singles(r)])).toEqual([
      [12, 0],
      [8, 4],
    ]);
  });
});
