import { describe, expect, it } from "vitest";
import { dateTile, directionsLinks, longDay, placeText, restaurantsLink, shareLinks, telHref } from "./links";

const venue = { lat: 43.2927, lng: 5.5708, address: "Boulodrome des Platanes, 12 allée des Joueurs", postcode: "13400", city: "Aubagne" };
const noGps = { ...venue, lat: null, lng: null };

describe("details page links", () => {
  it("writes the address on one line", () => {
    expect(placeText(venue)).toBe("Boulodrome des Platanes, 12 allée des Joueurs, 13400 Aubagne");
    expect(placeText({ ...venue, address: null, postcode: null })).toBe("Aubagne");
    expect(placeText({ lat: null, lng: null, address: null, postcode: null, city: null })).toBe("");
  });

  it("opens directions on the coordinates when known", () => {
    expect(directionsLinks(venue)).toEqual({
      google: "https://www.google.com/maps/dir/?api=1&destination=43.2927,5.5708",
      waze: "https://waze.com/ul?ll=43.2927,5.5708&navigate=yes",
      apple: "https://maps.apple.com/?daddr=43.2927,5.5708",
    });
  });

  it("falls back to the address text", () => {
    const links = directionsLinks(noGps)!;
    const q = encodeURIComponent("Boulodrome des Platanes, 12 allée des Joueurs, 13400 Aubagne");
    expect(links.google).toBe(`https://www.google.com/maps/dir/?api=1&destination=${q}`);
    expect(links.waze).toBe(`https://waze.com/ul?q=${q}&navigate=yes`);
    expect(links.apple).toBe(`https://maps.apple.com/?daddr=${q}`);
    expect(directionsLinks({ lat: null, lng: null, address: null, postcode: null, city: null })).toBeNull();
  });

  it("searches restaurants around the venue", () => {
    expect(restaurantsLink(venue)).toBe("https://www.google.com/maps/search/restaurants/@43.2927,5.5708,15z");
    expect(restaurantsLink(noGps)).toBe(`https://www.google.com/maps/search/${encodeURIComponent("restaurants 13400 Aubagne")}`);
    expect(restaurantsLink({ lat: null, lng: null, address: null, postcode: null, city: null })).toBeNull();
  });

  it("builds share links with encoded text and url", () => {
    const s = shareLinks("https://orgasport.fr/concours/GP3M", "Grand Prix & co · sam. 24 oct.");
    expect(s.whatsapp).toBe(`https://wa.me/?text=${encodeURIComponent("Grand Prix & co · sam. 24 oct. https://orgasport.fr/concours/GP3M")}`);
    expect(s.facebook).toBe("https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Forgasport.fr%2Fconcours%2FGP3M");
  });

  it("cleans phone numbers for tel: links", () => {
    expect(telHref("06 39 98 00 01")).toBe("tel:0639980001");
    expect(telHref("+33 (0)6.39.98.00.01")).toBe("tel:+330639980001");
  });

  it("formats dates in Paris time", () => {
    // 23:30 UTC on Friday = 01:30 on Saturday in Paris (summer time).
    expect(dateTile("2026-10-23T23:30:00Z")).toEqual({ weekday: "samedi", day: "24", month: "oct." });
    expect(longDay("2026-10-24T12:00:00Z", Date.parse("2026-10-12T08:00:00Z"))).toBe("samedi 24 octobre");
    expect(longDay("2027-01-09T12:00:00Z", Date.parse("2026-10-12T08:00:00Z"))).toBe("samedi 9 janvier 2027");
  });
});
