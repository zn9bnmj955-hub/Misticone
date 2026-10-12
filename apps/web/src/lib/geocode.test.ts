import { describe, expect, it } from "vitest";
import { parseGeocodeResponse } from "./geocode";

describe("geocoding response", () => {
  it("maps Géoplateforme features to places", () => {
    const json = {
      type: "FeatureCollection",
      features: [
        {
          geometry: { type: "Point", coordinates: [5.5708, 43.2927] },
          properties: { label: "Aubagne", city: "Aubagne", postcode: "13400", type: "municipality" },
        },
      ],
    };
    expect(parseGeocodeResponse(json)).toEqual([{ label: "Aubagne", city: "Aubagne", postcode: "13400", lat: 43.2927, lng: 5.5708 }]);
  });
  it("ignores malformed answers", () => {
    expect(parseGeocodeResponse(null)).toEqual([]);
    expect(parseGeocodeResponse({ features: [{ geometry: {}, properties: {} }] })).toEqual([]);
  });
});
