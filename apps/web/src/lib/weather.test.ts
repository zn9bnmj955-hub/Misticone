import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

const { getForecast, parseMetForecast, symbolKind, weatherLink } = await import("./weather");

const fixture = {
  properties: {
    timeseries: [
      {
        time: "2026-10-24T11:00:00Z",
        data: { instant: { details: { air_temperature: 17.4, wind_speed: 3 } }, next_1_hours: { summary: { symbol_code: "fair_day" }, details: { precipitation_amount: 0 } } },
      },
      {
        time: "2026-10-24T12:00:00Z",
        data: { instant: { details: { air_temperature: 18.6, wind_speed: 5 } }, next_1_hours: { summary: { symbol_code: "lightrainshowers_day" }, details: { precipitation_amount: 0.4 } } },
      },
      { time: "2026-10-25T00:00:00Z", data: { instant: { details: { air_temperature: 9 } }, next_6_hours: { summary: { symbol_code: "clearsky_night" } } } },
    ],
  },
};

describe("weather", () => {
  it("maps MET Norway symbols to simple kinds", () => {
    expect(symbolKind("clearsky_day")).toBe("sun");
    expect(symbolKind("partlycloudy_night")).toBe("partly");
    expect(symbolKind("heavyrainandthunder")).toBe("storm");
    expect(symbolKind("lightsleet")).toBe("snow");
    expect(symbolKind("rainshowers_day")).toBe("showers");
    expect(symbolKind("cloudy")).toBe("cloud");
  });

  it("uses the step closest to the start time", () => {
    expect(parseMetForecast(fixture, "2026-10-24T12:20:00Z")).toEqual({
      at: "2026-10-24T12:00:00Z",
      kind: "showers",
      temperatureC: 19,
      precipitationMm: 0.4,
      windKmh: 18,
    });
  });

  it("returns nothing for far or malformed data", () => {
    expect(parseMetForecast(fixture, "2026-11-10T12:00:00Z")).toBeNull();
    expect(parseMetForecast({}, "2026-10-24T12:00:00Z")).toBeNull();
  });

  it("does not call the API outside the forecast range or without a place", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const now = Date.parse("2026-10-12T10:00:00Z");
    expect(await getForecast(43.3, 5.5, "2026-12-24T12:00:00Z", now)).toBeNull();
    expect(await getForecast(null, null, "2026-10-14T12:00:00Z", now)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("always offers a weather link", () => {
    expect(weatherLink(43.29, 5.57, "Aubagne")).toContain("43.2900,5.5700");
    expect(weatherLink(null, null, "Aubagne")).toContain("Aubagne");
  });
});
