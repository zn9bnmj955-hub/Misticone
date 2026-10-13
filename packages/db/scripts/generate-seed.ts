/**
 * Generates supabase/seed.sql: sports, a demo club, demo accounts and four
 * tournaments (3 pétanque, 1 football). Run with `pnpm --filter @orgasport/db seed:gen`.
 *
 * Dates are SQL expressions relative to now(), so the "live" tournament is
 * always live whenever the database is reset.
 *
 * LOCAL DEMO ONLY: the demo accounts have a known password.
 */
import { SPORTS, requireSport, type SportConfig } from "@orgasport/sports";
import {
  applyCommand,
  createIdGenerator,
  defaultTournamentConfig,
  rulesFromSport,
  teamScoreCode,
  type Command,
  type EngineState,
  type Match,
  type TournamentConfig,
} from "@orgasport/engine";
import { entityToRow } from "../src/engine-mapping";
import { KB_DOCS } from "./kb-content";
import { APP_SETTINGS, LEGAL_PAGES, PRICING_PLANS } from "./reference-data";

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261012);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
function uuid(): string {
  const h = () => Math.floor(rand() * 16).toString(16);
  const s = Array.from({ length: 32 }, h);
  s[12] = "4";
  s[16] = ((parseInt(s[16]!, 16) & 0x3) | 0x8).toString(16);
  const j = s.join("");
  return `${j.slice(0, 8)}-${j.slice(8, 12)}-${j.slice(12, 16)}-${j.slice(16, 20)}-${j.slice(20)}`;
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------
type Val = string | number | boolean | null | { sql: string };
const raw = (sql: string) => ({ sql });
function lit(v: Val): string {
  if (v === null) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return v.sql;
  return `'${v.replace(/'/g, "''")}'`;
}
const out: string[] = [];
function insert(table: string, rows: Record<string, Val>[]) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]!);
  out.push(
    `insert into ${table} (${cols.join(", ")}) values\n` +
      rows.map((r) => `  (${cols.map((c) => lit(r[c] ?? null)).join(", ")})`).join(",\n") +
      ";\n",
  );
}
const ago = (minutes: number) => raw(`now() - interval '${minutes} minutes'`);
const inDays = (days: number, hour: number) =>
  raw(`(date_trunc('day', now() at time zone 'Europe/Paris') + interval '${days} days ${hour} hours') at time zone 'Europe/Paris'`);

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
const FIRST = [
  "Lucas", "Hugo", "Louis", "Gabriel", "Jules", "Arthur", "Nathan", "Léo", "Raphaël", "Adam",
  "Karim", "Mehdi", "Yanis", "Antoine", "Thomas", "Julien", "Nicolas", "Pierre", "Marc", "Didier",
  "Patrick", "Gérard", "Michel", "Alain", "Bernard", "Jean-Luc", "Christian", "Serge", "Robert", "René",
  "Emma", "Jade", "Louise", "Alice", "Chloé", "Léa", "Manon", "Inès", "Camille", "Sarah",
  "Nathalie", "Isabelle", "Sylvie", "Sandrine", "Martine", "Christine", "Monique", "Fatima", "Laura", "Julie",
];
const LAST = [
  "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau",
  "Simon", "Laurent", "Lefèvre", "Michel", "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier",
  "Morel", "Girard", "André", "Mercier", "Dupont", "Lambert", "Bonnet", "François", "Martinez", "Legrand",
  "Garnier", "Faure", "Rousseau", "Blanc", "Guerin", "Muller", "Henry", "Roussel", "Nicolas", "Perrin",
  "Morin", "Mathieu", "Clément", "Gauthier", "Dumont", "Lopez", "Fontaine", "Chevalier", "Robin", "Masson",
  "Benali", "Haddad", "Ferrari", "Rossi", "Marchetti", "Santoni", "Giordano", "Pellegrin", "Olivier", "Barbier",
];
const PETANQUE_CLUBS = [
  "AS Les Platanes",
  "La Boule Aubagnaise",
  "Pétanque Gémenosienne",
  "Les Cigales de Cassis",
  "Boule Joyeuse de Roquevaire",
  "Amicale Bouliste de Cuges",
  "La Ciotat Pétanque Club",
  null,
] as const;

let phoneCounter = 0;
const fictionalPhone = () => {
  // ARCEP range reserved for fiction: 06 39 98 xx xx
  const n = String(phoneCounter++ % 10000).padStart(4, "0");
  return `06 39 98 ${n.slice(0, 2)} ${n.slice(2)}`;
};
const slugify = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
out.push("-- GENERATED by packages/db/scripts/generate-seed.ts. Do not edit by hand.");
out.push("-- Local demo data only. Demo password for every account: orgasport-demo\n");

// Sports ---------------------------------------------------------------------
insert(
  "public.sports",
  SPORTS.map((s) => ({
    slug: s.slug,
    name: s.name,
    config: raw(`'${JSON.stringify(s).replace(/'/g, "''")}'::jsonb`),
    enabled: s.enabled,
    sort_order: s.sortOrder,
  })),
);

// Accounts ---------------------------------------------------------------------
const users = {
  club: { id: uuid(), email: "club@demo.orgasport.fr", name: "Sandrine Roux" },
  player: { id: uuid(), email: "joueur@demo.orgasport.fr", name: "Karim Benali" },
  admin: { id: uuid(), email: "admin@demo.orgasport.fr", name: "Admin OrgaSport" },
  volunteer: { id: uuid(), email: "benevole@demo.orgasport.fr", name: "Gérard Faure" },
};
for (const u of Object.values(users)) {
  out.push(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', ${lit(u.id)}, 'authenticated', 'authenticated', ${lit(u.email)},
  extensions.crypt('orgasport-demo', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', ${lit(JSON.stringify({ full_name: u.name }))}, now(), now(), '', '', '', '', '', '', '', '');
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (${lit(uuid())}, ${lit(u.id)}, ${lit(u.id)}, ${lit(JSON.stringify({ sub: u.id, email: u.email, email_verified: true }))}::jsonb, 'email', now(), now(), now());
`);
}
insert("public.platform_admins", [{ user_id: users.admin.id }]);

// Club ------------------------------------------------------------------------
const AUBAGNE = { lat: 43.2927, lng: 5.5708 };
const club = { id: uuid(), slug: "as-les-platanes", name: "AS Les Platanes" };
insert("public.clubs", [
  {
    id: club.id,
    slug: club.slug,
    name: club.name,
    kind: "association",
    sports: raw("array['petanque','football']"),
    federation: "FFPJP",
    affiliation_number: "13-0421",
    address: "Boulodrome des Platanes, 12 allée des Joueurs",
    postcode: "13400",
    city: "Aubagne",
    lat: AUBAGNE.lat,
    lng: AUBAGNE.lng,
    default_venue_count: 24,
    contact_name: users.club.name,
    contact_email: "contact@as-les-platanes.example",
    contact_phone: fictionalPhone(),
    description:
      "Association fictive de démonstration : pétanque toute l'année sous les platanes, tournoi de foot à 7 pendant les fêtes.",
    created_by: users.club.id,
  },
]);
insert("public.club_members", [{ club_id: club.id, user_id: users.volunteer.id, role: "member" }]);

out.push(`update public.profiles set display_name = ${lit(users.club.name)}, sports = array['petanque','football'],
  city = 'Aubagne', postcode = '13400', lat = ${AUBAGNE.lat}, lng = ${AUBAGNE.lng}, active_club_id = ${lit(club.id)},
  onboarded_at = now() where id = ${lit(users.club.id)};
update public.profiles set display_name = ${lit(users.player.name)}, sports = array['petanque'], level = 'leisure',
  is_licensed = true, city = 'Aubagne', postcode = '13400', lat = ${AUBAGNE.lat}, lng = ${AUBAGNE.lng},
  search_radius_km = 30, notifications_opt_in = true, onboarded_at = now() where id = ${lit(users.player.id)};
update public.profiles_private set license_number = '13084512' where user_id = ${lit(users.player.id)};
update public.profiles set display_name = ${lit(users.admin.name)}, onboarded_at = now() where id = ${lit(users.admin.id)};
update public.profiles set display_name = ${lit(users.volunteer.name)}, sports = array['petanque'], onboarded_at = now() where id = ${lit(users.volunteer.id)};
`);

// Tournaments ------------------------------------------------------------------
// Played by the draw engine itself, so the demo data is exactly what a real
// tournament produces. Times are computed against a virtual "now" and written
// as offsets from now() in SQL.

const VIRTUAL_NOW = Date.UTC(2026, 9, 12, 14, 0);
const at = (minutes: number) => new Date(VIRTUAL_NOW + minutes * 60_000).toISOString();
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const relative = (iso: string) => raw(`now() + interval '${Math.round((Date.parse(iso) - VIRTUAL_NOW) / 60_000)} minutes'`);

/** Engine row → SQL values (timestamps become offsets from now()). */
function sqlRow(row: Record<string, unknown>): Record<string, Val> {
  const out: Record<string, Val> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "string" && ISO.test(v)) out[k] = relative(v);
    else if (Array.isArray(v)) out[k] = raw(`array[${v.map((x) => lit(String(x))).join(",")}]::uuid[]`);
    else out[k] = v as Val;
  }
  return out;
}

type Extra = { captainName: string; captainEmail: string; userId: string | null };
const registrationExtras = new Map<string, Extra>();
const playerUserIds = new Map<string, string>();
const licenseRows: Record<string, Val>[] = [];
const engineStates: EngineState[] = [];

function makeEngineTeams(
  count: number,
  size: number,
  opts: { clubNames?: readonly (string | null)[]; teamNames?: string[]; status: "registered" | "checked_in"; demoPlayerAt?: number; checkedInAt?: string },
): Pick<EngineState, "teams" | "players" | "teamSecrets" | "registrations"> {
  const teams: EngineState["teams"] = {};
  const players: EngineState["players"] = {};
  const teamSecrets: EngineState["teamSecrets"] = {};
  const registrations: EngineState["registrations"] = {};
  for (let n = 1; n <= count; n++) {
    const id = uuid();
    teams[id] = {
      id,
      number: n,
      name: opts.teamNames ? opts.teamNames[n - 1]! : null,
      club: opts.teamNames ? opts.teamNames[n - 1]! : pick(opts.clubNames ?? PETANQUE_CLUBS),
      status: opts.status,
      seed: null,
      bracket: "main",
      checkedInAt: opts.status === "checked_in" ? (opts.checkedInAt ?? at(-180)) : null,
    };
    let captain = "";
    let captainEmail = "";
    for (let p = 1; p <= size; p++) {
      const isDemo = opts.demoPlayerAt === n && p === 1;
      const first = isDemo ? "Karim" : pick(FIRST);
      const last = isDemo ? "Benali" : pick(LAST);
      const pid = uuid();
      if (p === 1) {
        captain = `${first} ${last}`;
        captainEmail = `${slugify(first)}.${slugify(last)}@example.com`;
      }
      players[pid] = { id: pid, teamId: id, firstName: first, lastName: last, position: p };
      if (isDemo) {
        playerUserIds.set(pid, users.player.id);
        licenseRows.push({ player_id: pid, license_number: "13084512" });
      } else if (rand() < 0.6) licenseRows.push({ player_id: pid, license_number: String(int(10000000, 99999999)) });
    }
    teamSecrets[id] = { id, code: teamScoreCode(id) };
    const regId = uuid();
    registrations[regId] = { id: regId, teamId: id, source: rand() < 0.7 ? "online" : "onsite" };
    registrationExtras.set(regId, { captainName: captain, captainEmail, userId: opts.demoPlayerAt === n ? users.player.id : null });
  }
  return { teams, players, teamSecrets, registrations };
}

function makeVenuesState(count: number, reservedLast = 0, labels?: string[]): EngineState["venues"] {
  const venues: EngineState["venues"] = {};
  for (let i = 1; i <= count; i++) {
    const id = uuid();
    venues[id] = { id, label: labels?.[i - 1] ?? String(i), position: i, reservedForFinals: i > count - reservedLast, available: true };
  }
  return venues;
}

let opCounter = 0;
function run(state: EngineState, cmd: Command, minutes: number): EngineState {
  const op = `seed-${state.tournament.id}-${++opCounter}`;
  return applyCommand(state, cmd, { now: at(minutes), newId: createIdGenerator(op), seed: op }).state;
}

const petanqueSport = requireSport("petanque");
const footballSport = requireSport("football");

const tournaments: Record<string, Val>[] = [];
const common = {
  club_id: club.id,
  address: "Boulodrome des Platanes, 12 allée des Joueurs",
  postcode: "13400",
  city: "Aubagne",
  lat: AUBAGNE.lat,
  lng: AUBAGNE.lng,
  parking: "Parking gratuit de 80 places derrière le boulodrome.",
  food: "Buvette et sandwichs sur place, grillades le soir.",
  contact_name: users.club.name,
  contact_phone: fictionalPhone(),
  created_by: users.club.id,
  registration_mode: "both",
  waitlist_enabled: true,
};

function engineState(
  id: string,
  status: EngineState["tournament"]["status"],
  startsAt: string | null,
  maxTeams: number | null,
  sport: SportConfig,
  teamFormat: string,
  config: TournamentConfig,
  parts: Pick<EngineState, "teams" | "players" | "teamSecrets" | "registrations">,
  venues: EngineState["venues"],
): EngineState {
  return { tournament: { id, status, startsAt, maxTeams, config }, rules: rulesFromSport(sport, teamFormat), venues, rounds: {}, matches: {}, ...parts };
}

const scoreFor = (s: EngineState, winnerSide: "A" | "B") => {
  const target = s.rules.scoring.mode === "points" ? s.rules.scoring.target : 3;
  const loser = int(0, target - 1);
  return winnerSide === "A" ? { scoreA: target, scoreB: loser } : { scoreA: loser, scoreB: target };
};

// 1. Upcoming pétanque (published, registrations open) ----------------------
const t1 = uuid();
const t1Config = defaultTournamentConfig(petanqueSport);
tournaments.push({
  id: t1,
  ...common,
  sport_slug: "petanque",
  short_code: "GP3M",
  name: "Grand Prix des Platanes",
  status: "published",
  starts_at: inDays(12, 14),
  registration_closes_at: inDays(11, 20),
  checkin_closes_at: inDays(12, 13.5),
  team_format: "doublette",
  category: "all",
  eligibility: "open",
  max_teams: 64,
  name_display: "initials",
  fee_cents: 1000,
  fee_per: "team",
  prize_text: "Mises + 300 €",
  welcome_message: "Bienvenue au Grand Prix ! Pointage à la table de marque jusqu'à 13 h 30.",
  rules_text: "Règlement FFPJP. Parties en 13 points. Tenue correcte exigée.",
  config: raw(`'${JSON.stringify(t1Config)}'::jsonb`),
  draw_seed: null,
  published_at: ago(60 * 24 * 5),
});
engineStates.push(
  engineState(t1, "published", null, 64, petanqueSport, "doublette", t1Config, makeEngineTeams(23, 2, { status: "registered" }), makeVenuesState(32, 2)),
);

// 2. Live pétanque: 32 doublettes, round 2 in progress (code 7KQ2) ----------
const t2 = uuid();
const t2Config: TournamentConfig = { ...defaultTournamentConfig(petanqueSport), bracketMode: "redraw", consolation: { enabled: true, losersOfRound: 1 } };
tournaments.push({
  id: t2,
  ...common,
  sport_slug: "petanque",
  short_code: "7KQ2",
  name: "Concours de la Saint-Michel",
  status: "check_in",
  starts_at: ago(150),
  registration_closes_at: ago(60 * 20),
  checkin_closes_at: ago(165),
  team_format: "doublette",
  category: "all",
  eligibility: "open",
  max_teams: 32,
  name_display: "full",
  fee_cents: 1000,
  fee_per: "team",
  prize_text: "Mises + 200 €",
  welcome_message: "Bon concours à tous ! Les résultats sont à rendre à la table de marque.",
  rules_text: "Règlement FFPJP. Parties en 13 points. Complémentaire pour les perdants du 1er tour.",
  config: raw(`'${JSON.stringify(t2Config)}'::jsonb`),
  draw_seed: "saint-michel-2026",
  published_at: ago(60 * 24 * 14),
});
{
  const venues = makeVenuesState(14, 1, [...Array.from({ length: 13 }, (_, i) => String(i + 1)), "Honneur"]);
  const parts = makeEngineTeams(32, 2, { status: "checked_in", demoPlayerAt: 14, checkedInAt: at(-175) });
  const demoTeam = Object.values(parts.teams).find((t) => t.number === 14)!.id;
  let s = engineState(t2, "check_in", at(-150), 32, petanqueSport, "doublette", t2Config, parts, venues);
  s = run(s, { type: "round.draw", bracket: "main", seed: "saint-michel-2026" }, -150);
  // Round 1: every match played, the demo team wins.
  let clock = -150;
  const roundOf = (m: Match) => s.rounds[m.roundId]!;
  for (let guard = 0; guard < 100; guard++) {
    const r1 = Object.values(s.matches).filter((m) => roundOf(m).bracket === "main" && roundOf(m).number === 1 && m.status === "ready");
    if (r1.length === 0) break;
    const m = r1.sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""))[0]!;
    clock = Math.max(clock + 2, Math.round((Date.parse(m.scheduledAt!) - VIRTUAL_NOW) / 60_000) + int(35, 55));
    const side = m.sideA.includes(demoTeam) ? "A" : m.sideB.includes(demoTeam) ? "B" : rand() < 0.5 ? "A" : "B";
    s = run(s, { type: "match.score", matchId: m.id, ...scoreFor(s, side) }, clock);
  }
  // Round 2 and consolation round 1 were drawn automatically.
  const inRound = (bracket: "main" | "consolation", n: number) =>
    Object.values(s.matches)
      .filter((m) => roundOf(m).bracket === bracket && roundOf(m).number === n)
      .sort((a, b) => a.position - b.position);
  const demoMatch = () => inRound("main", 2).find((m) => [...m.sideA, ...m.sideB].includes(demoTeam))!;
  let played = 0;
  for (const m of inRound("main", 2)) {
    if (m.id === demoMatch().id || s.matches[m.id]!.status !== "ready") continue;
    clock += 3;
    if (played++ < 3) s = run(s, { type: "match.score", matchId: m.id, ...scoreFor(s, rand() < 0.5 ? "A" : "B") }, clock);
    else s = run(s, { type: "match.start", matchId: m.id }, clock);
  }
  let consPlayed = 0;
  for (const m of inRound("consolation", 1)) {
    if (s.matches[m.id]!.status !== "ready") continue;
    clock += 2;
    if (consPlayed++ < 2) s = run(s, { type: "match.score", matchId: m.id, ...scoreFor(s, rand() < 0.5 ? "A" : "B") }, clock);
    else s = run(s, { type: "match.start", matchId: m.id }, clock);
  }
  // The demo team plays next on venue 12 ("À vous de jouer").
  const venue12 = Object.values(s.venues).find((v) => v.label === "12")!;
  if (demoMatch().status === "ready" || demoMatch().status === "waiting_venue") {
    s = run(s, { type: "match.setVenue", matchId: demoMatch().id, venueId: venue12.id }, -4);
  }
  engineStates.push(s);
}

// 3. Finished pétanque: 16 triplettes, fixed bracket --------------------------
const t3 = uuid();
const t3Config: TournamentConfig = { ...defaultTournamentConfig(petanqueSport), bracketMode: "fixed", consolation: { enabled: false, losersOfRound: 1 } };
tournaments.push({
  id: t3,
  ...common,
  sport_slug: "petanque",
  short_code: "TR8E",
  name: "Trophée d'été des Platanes",
  status: "check_in",
  starts_at: raw("now() - interval '3 days'"),
  registration_closes_at: raw("now() - interval '4 days'"),
  checkin_closes_at: raw("now() - interval '3 days 30 minutes'"),
  team_format: "triplette",
  category: "veterans",
  eligibility: "licensed",
  max_teams: 16,
  name_display: "initials",
  fee_cents: 500,
  fee_per: "player",
  prize_text: "Mises + 150 €",
  rules_text: "Réservé aux licenciés vétérans. Parties en 13 points.",
  config: raw(`'${JSON.stringify(t3Config)}'::jsonb`),
  draw_seed: "ete-2026",
  published_at: raw("now() - interval '20 days'"),
});
{
  const start = -60 * 24 * 3;
  let s = engineState(t3, "check_in", at(start), 16, petanqueSport, "triplette", t3Config, makeEngineTeams(16, 3, { status: "checked_in", checkedInAt: at(start - 20) }), makeVenuesState(10));
  s = run(s, { type: "round.draw", bracket: "main", seed: "ete-2026" }, start);
  let clock = start;
  for (let guard = 0; guard < 200 && s.tournament.status !== "finished"; guard++) {
    const m = Object.values(s.matches)
      .filter((x) => x.status === "ready")
      .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""))[0];
    if (!m) break;
    clock = Math.max(clock + 2, Math.round((Date.parse(m.scheduledAt!) - VIRTUAL_NOW) / 60_000) + int(35, 60));
    s = run(s, { type: "match.score", matchId: m.id, ...scoreFor(s, rand() < 0.5 ? "A" : "B") }, clock);
  }
  engineStates.push(s);
}

// 4. Football: 8 teams, foot à 7, upcoming ----------------------------------
const t4 = uuid();
const t4Config = defaultTournamentConfig(footballSport);
tournaments.push({
  id: t4,
  ...common,
  address: "Stade municipal des Platanes, chemin du Stade",
  parking: "Parking du stade.",
  sport_slug: "football",
  short_code: "FT8S",
  name: "Tournoi des fêtes des Platanes",
  status: "published",
  starts_at: inDays(20, 9),
  registration_closes_at: inDays(18, 20),
  checkin_closes_at: inDays(20, 8.5),
  team_format: "foot-7",
  category: "seniors",
  eligibility: "open",
  max_teams: 8,
  name_display: "full",
  fee_cents: 5000,
  fee_per: "team",
  prize_text: "Coupe et médailles, repas offert aux finalistes",
  rules_text: "Foot à 7, matchs de 2 × 10 minutes. Protège-tibias obligatoires.",
  config: raw(`'${JSON.stringify(t4Config)}'::jsonb`),
  draw_seed: null,
  published_at: ago(60 * 24 * 3),
});
engineStates.push(
  engineState(
    t4,
    "published",
    null,
    8,
    footballSport,
    "foot-7",
    t4Config,
    makeEngineTeams(8, 9, {
      status: "registered",
      teamNames: ["AS Les Platanes", "FC Gémenos Vétérans", "US Roquevaire", "Cassis FC", "SC La Ciotat", "Entente Cuges", "Auriol Sports", "Carnoux FC"],
    }),
    makeVenuesState(2, 0, ["A", "B"]),
  ),
);

// Final status of each tournament comes from the engine (live / finished).
for (const s of engineStates) {
  const row = tournaments.find((t) => t.id === s.tournament.id)!;
  row.status = s.tournament.status;
  row.state_version = 0;
}
insert("public.tournaments", tournaments);

const rowsOf = <K extends keyof EngineState>(key: K, entity: Parameters<typeof entityToRow>[0]) =>
  engineStates.flatMap((s) => Object.values(s[key] as unknown as Record<string, Record<string, unknown>>).map((e) => entityToRow(entity, e, s.tournament.id)));

insert("public.venues", rowsOf("venues", "venue").map(sqlRow));
insert("public.teams", rowsOf("teams", "team").map(sqlRow));
insert(
  "public.players",
  rowsOf("players", "player").map((r) => sqlRow({ ...r, user_id: playerUserIds.get(r.id as string) ?? null })),
);
insert("public.players_private", licenseRows);
insert("public.team_secrets", rowsOf("teamSecrets", "teamSecret").map(sqlRow));
insert(
  "public.registrations",
  rowsOf("registrations", "registration").map((r) => {
    const extra = registrationExtras.get(r.id as string)!;
    return sqlRow({
      ...r,
      user_id: extra.userId,
      captain_name: extra.captainName,
      captain_phone: fictionalPhone(),
      captain_email: extra.captainEmail,
      accepted_rules_at: at(-int(1440, 20000)),
    });
  }),
);
insert("public.rounds", rowsOf("rounds", "round").map(sqlRow));
insert("public.matches", rowsOf("matches", "match").map(sqlRow));

// Staff: the club owner organizes everything; a volunteer has a PIN on 7KQ2.
insert(
  "public.tournament_staff",
  [t1, t2, t3, t4].map((tid) => ({
    id: uuid(),
    tournament_id: tid,
    user_id: users.club.id,
    role: "organizer",
    label: users.club.name,
    email: users.club.email,
    pin_hash: null,
  })),
);
insert("public.tournament_staff", [
  {
    id: uuid(),
    tournament_id: t2,
    user_id: null,
    role: "co_organizer",
    label: "Table de marque (PIN)",
    email: null,
    pin_hash: raw("extensions.crypt('4821', extensions.gen_salt('bf'))"),
  },
]);

insert("public.follows", [{ id: uuid(), user_id: users.player.id, club_id: club.id, tournament_id: null }]);

insert("public.announcements", [
  {
    id: uuid(),
    club_id: club.id,
    sport_slug: "petanque",
    title: "Nouveaux terrains éclairés au boulodrome",
    body: "Les 8 terrains du fond sont désormais éclairés : concours en nocturne tous les vendredis de juillet.",
    published_at: ago(60 * 24 * 2),
    created_by: users.club.id,
  },
  {
    id: uuid(),
    club_id: club.id,
    sport_slug: "football",
    title: "Inscriptions ouvertes pour le tournoi des fêtes",
    body: "8 équipes maximum, foot à 7. Premier arrivé, premier servi !",
    published_at: ago(60 * 24 * 3),
    created_by: users.club.id,
  },
]);

// Pricing, settings and legal placeholders --------------------------------------
insert(
  "public.pricing_plans",
  PRICING_PLANS.map((p) => ({ id: uuid(), ...p, max_teams: p.max_teams ?? null, currency: "eur", active: true })),
);
// Demo promo codes (local only).
insert("public.promo_codes", [
  { id: uuid(), code: "BIENVENUE", description: "Premier concours offert (démo)", percent_off: 100, active: true },
  { id: uuid(), code: "CLUB50", description: "-50 % (démo)", percent_off: 50, active: true },
]);
// A draft left half-way by the club: the dashboard shows "Continuer".
insert("public.tournaments", [
  {
    id: uuid(),
    club_id: club.id,
    sport_slug: "petanque",
    name: "Concours de la Toussaint",
    status: "draft",
    created_by: users.club.id,
    draft_step: "participants",
    draft_form: raw(
      `'${JSON.stringify({ sportSlug: "petanque", name: "Concours de la Toussaint", teamFormat: "triplette" }).replace(/'/g, "''")}'::jsonb`,
    ),
  },
]);
insert(
  "public.app_settings",
  APP_SETTINGS.map(([key, value, description]) => ({
    key,
    value: raw(`'${JSON.stringify(value)}'::jsonb`),
    description,
  })),
);
// Assistant knowledge base (chunked automatically by a trigger).
insert(
  "public.kb_documents",
  KB_DOCS.map((d) => ({ id: uuid(), title: d.title, sport_slug: d.sport, source_url: d.source, body: d.body, published: true })),
);
// News feed demo: one clearly fictional source (real feeds are added in the admin).
// Enabled so its items show in the feed; the hourly fetch just fails on example.org.
const demoSource = uuid();
insert("public.news_sources", [
  { id: demoSource, name: "Démo OrgaSport", feed_url: "https://example.org/orgasport-demo.xml", site_url: "https://example.org", sport_slug: null, enabled: true },
]);
insert("public.news_items", [
  { id: uuid(), source_id: demoSource, title: "(Démo) Championnat départemental doublettes : les résultats", url: "https://example.org/demo/resultats-doublettes", published_at: ago(60 * 5) },
  { id: uuid(), source_id: demoSource, title: "(Démo) Nouvelle saison de foot à 7 : ce qui change", url: "https://example.org/demo/foot-a-7", published_at: ago(60 * 26) },
  { id: uuid(), source_id: demoSource, title: "(Démo) Les clubs de pétanque recrutent des bénévoles", url: "https://example.org/demo/benevoles", published_at: ago(60 * 50) },
]);
insert("public.legal_pages", LEGAL_PAGES.map((l) => ({ ...l, body: "", published: false })));

process.stdout.write(out.join("\n"));
