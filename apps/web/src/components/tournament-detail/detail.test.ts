import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Roster } from "@/lib/data/registrants";
import type { Forecast } from "@/lib/weather";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement("a", { href, ...rest }, children as never),
}));
const roster = vi.fn<() => Promise<Roster | null>>();
vi.mock("@/lib/data/registrants", () => ({ getRoster: () => roster(), getMyTeamNumbers: async () => [] }));
const forecast = vi.fn<() => Promise<Forecast | null>>();
vi.mock("@/lib/weather", () => ({
  getForecast: () => forecast(),
  weatherLink: () => "https://www.yr.no/en/forecast/daily-table/43.2927,5.5708",
}));

const { getSport } = await import("@orgasport/sports");
const { PlacesGauge, RegistrationCta, StatusBadge } = await import("./RegistrationBox");
const { WeatherTile } = await import("./WeatherTile");
const { KeyFacts } = await import("./KeyFacts");
type Detail = Parameters<typeof RegistrationCta>[0]["t"];

const sport = getSport("petanque")!;
const DAY = 86_400_000;
const base = (patch: Partial<Detail> = {}): Detail => ({
  id: "t1",
  short_code: "GP3M",
  name: "Grand Prix",
  status: "published",
  sport_slug: "petanque",
  starts_at: new Date(Date.now() + 5 * DAY).toISOString(),
  registration_closes_at: new Date(Date.now() + 4 * DAY).toISOString(),
  checkin_closes_at: null,
  address: "Boulodrome",
  postcode: "13400",
  city: "Aubagne",
  lat: 43.2927,
  lng: 5.5708,
  parking: null,
  food: null,
  team_format: "doublette",
  category: "all",
  eligibility: "open",
  registration_mode: "both",
  waitlist_enabled: true,
  max_teams: 16,
  name_display: "initials",
  fee_cents: 1000,
  fee_per: "team",
  prize_text: null,
  welcome_message: null,
  rules_text: null,
  contact_name: null,
  contact_phone: null,
  config: {},
  club: { name: "AS Les Platanes", slug: "as-les-platanes" },
  format: "single_elimination",
  posterUrl: null,
  rulesPdfUrl: null,
  ...patch,
});
const live = (active: number, status: Roster["status"] = "published", waitlist = 0): Roster => ({ status, teams: [], active, waitlist });
const html = async (el: Promise<ReactElement>) => renderToStaticMarkup(await el);

describe("registration call to action", () => {
  beforeEach(() => roster.mockReset());

  it("offers online registration while places remain", async () => {
    roster.mockResolvedValue(live(15));
    const out = await html(RegistrationCta({ t: base(), code: "GP3M" }));
    expect(out).toContain('href="/c/GP3M/inscription"');
    expect(out).toContain("S&#x27;inscrire");
    expect(out).toContain("Plus qu&#x27;une place");
    expect(out).toContain('href="/c/GP3M"');
  });

  it("switches to the waiting list when full", async () => {
    roster.mockResolvedValue(live(16, "published", 2));
    const out = await html(RegistrationCta({ t: base(), code: "GP3M" }));
    expect(out).toContain("S&#x27;inscrire en liste d&#x27;attente");
    expect(await html(StatusBadge({ t: base() }))).toContain("Complet · liste d&#x27;attente");
  });

  it("says full, closed or on site only without a registration link", async () => {
    roster.mockResolvedValue(live(16));
    expect(await html(RegistrationCta({ t: base({ waitlist_enabled: false }), code: "GP3M" }))).not.toContain("/inscription");
    roster.mockResolvedValue(live(3));
    const closed = await html(RegistrationCta({ t: base({ registration_closes_at: new Date(Date.now() - 1000).toISOString() }), code: "GP3M" }));
    expect(closed).toContain("Inscriptions closes");
    expect(closed).not.toContain("/inscription");
    const onsite = await html(RegistrationCta({ t: base({ registration_mode: "onsite" }), code: "GP3M" }));
    expect(onsite).toContain("Inscriptions sur place uniquement");
    expect(onsite).not.toContain("/inscription");
  });

  it("uses the live status rather than the cached one", async () => {
    roster.mockResolvedValue(live(16, "live"));
    const out = await html(RegistrationCta({ t: base(), code: "7KQ2" }));
    expect(out).toContain("Suivre le concours en direct");
    expect(out).not.toContain("/inscription");
    roster.mockResolvedValue(live(16, "finished"));
    expect(await html(RegistrationCta({ t: base(), code: "TR8E" }))).toContain("Voir les résultats");
  });
});

describe("places gauge", () => {
  it("counts teams and remaining places", async () => {
    roster.mockResolvedValue(live(10, "published", 0));
    expect(await html(PlacesGauge({ t: base(), sport }))).toContain("10 / 16 équipes · 6 places restantes");
  });

  it("does not talk about places once registrations are over", async () => {
    roster.mockResolvedValue(live(12, "live", 1));
    const out = await html(PlacesGauge({ t: base(), sport }));
    expect(out).toContain("12 / 16 équipes");
    expect(out).not.toContain("restantes");
    expect(out).not.toContain("liste d&#x27;attente");
  });

  it("speaks of players for a mêlée", async () => {
    roster.mockResolvedValue(live(5));
    const melee = sport.teamFormats.find((f) => f.individualRegistration)!;
    expect(await html(PlacesGauge({ t: base({ team_format: melee.id, max_teams: null }), sport }))).toContain("5 joueurs");
  });
});

describe("weather tile", () => {
  it("summarizes the forecast with its attribution", async () => {
    forecast.mockResolvedValue({ at: "2026-10-24T12:00:00Z", kind: "showers", temperatureC: 17, precipitationMm: 1.2, windKmh: 11 });
    const out = await html(WeatherTile({ t: base() }));
    expect(out).toContain("Averses");
    expect(out).toContain("17 °C");
    expect(out).toContain("1,2 mm de pluie");
    expect(out).toContain("Vent 11 km/h");
    expect(out).toContain("MET Norway");
    expect(out).toContain("yr.no");
  });

  it("keeps the weather link when the forecast is out of range or unreachable", async () => {
    forecast.mockResolvedValue(null);
    const far = await html(WeatherTile({ t: base({ starts_at: new Date(Date.now() + 20 * DAY).toISOString() }) }));
    expect(far).toContain("9 jours avant");
    expect(far).toContain("yr.no");
    const down = await html(WeatherTile({ t: base() }));
    expect(down).not.toContain("9 jours avant");
    expect(down).toContain("yr.no");
  });
});

describe("key facts: concours B entry fee", () => {
  const b = (consolation: Record<string, unknown>) => base({ config: { consolation } } as Partial<Detail>);
  const facts = (t: Detail) => renderToStaticMarkup(createElement(KeyFacts, { t: t as never, sport }));

  it("shows the B fee when teams sign up for the B", () => {
    const out = facts(b({ enabled: true, entry: "opt_in", feeCents: 500 }));
    expect(out).toContain("Concours B : 5");
    expect(out).toContain("par équipe, sur place");
  });

  it("says nothing for an automatic, free or disabled B, nor an old config", () => {
    for (const t of [
      b({ enabled: true, entry: "auto", feeCents: 500 }),
      b({ enabled: true, entry: "opt_in", feeCents: null }),
      b({ enabled: false, entry: "opt_in", feeCents: 500 }),
      b({ enabled: true, losersOfRound: 1 }),
      base(),
    ]) expect(facts(t)).not.toContain("Concours B");
  });
});
