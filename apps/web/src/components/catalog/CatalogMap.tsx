"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import type { MapPoint } from "./model";

/**
 * Leaflet map of the catalog, loaded on demand only (see CatalogMapView):
 * the list view never downloads Leaflet. Tiles come from
 * NEXT_PUBLIC_MAP_TILES_URL (OpenStreetMap by default); when they cannot be
 * loaded, markers and popups still work on a plain surface.
 */
const TILES_URL = process.env.NEXT_PUBLIC_MAP_TILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Pin in the sport's accent color (tokens only); grouped places show their count. */
function pinHtml(count: number, accentToken: string | null): string {
  const sport = accentToken ? ` data-sport="${accentToken}"` : "";
  const center =
    count > 1
      ? `<text x="17" y="21.5" text-anchor="middle" font-size="12" font-weight="800" style="fill: var(--os-ink)">${count > 99 ? "99+" : count}</text>`
      : "";
  return (
    `<span${sport} class="block text-accent" style="filter: drop-shadow(0 2px 2px var(--os-line))">` +
    '<svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true"><path d="M17 1C8.2 1 1 8 1 16.8 1 28.6 17 43 17 43s16-14.4 16-26.2C33 8 25.8 1 17 1z" fill="currentColor" style="stroke: var(--os-ink); stroke-width: 2"/>' +
    `<circle cx="17" cy="17" r="${count > 1 ? 9 : 6}" style="fill: var(--os-surface)"/>${center}</svg></span>`
  );
}

/** Popup content built with DOM nodes (tournament names are never parsed as HTML). */
function popupContent(p: MapPoint): HTMLElement {
  const list = document.createElement("ul");
  list.className = "grid gap-2 m-0 p-0 list-none";
  for (const item of p.items) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = item.href;
    a.className = "block font-bold text-base underline text-ink";
    a.textContent = item.name;
    const when = document.createElement("span");
    when.className = "block text-sm text-ink-soft tabular";
    when.textContent = item.when;
    li.append(a, when);
    list.append(li);
  }
  return list;
}

/** Popups in the app's colors, light and dark (Leaflet's own CSS is white). */
const POPUP_CSS =
  ".os-catalog-popup .leaflet-popup-content-wrapper,.os-catalog-popup .leaflet-popup-tip{background:var(--os-surface);color:var(--os-ink);box-shadow:0 2px 10px var(--os-line)}" +
  ".os-catalog-popup .leaflet-popup-content{margin:14px 18px;font:inherit}" +
  ".os-catalog-popup a.leaflet-popup-close-button{color:var(--os-ink-soft)}";

export default function CatalogMap({
  points,
  label,
  attribution,
  pinLabel,
  className,
}: {
  points: MapPoint[];
  label: string;
  attribution: string;
  /** Accessible name of a marker, e.g. « 3 concours à Aubagne ». */
  pinLabel: (p: MapPoint) => string;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const labelRef = useRef(pinLabel);
  useEffect(() => {
    labelRef.current = pinLabel;
  }, [pinLabel]);

  // Rebuilt when the set of points changes (filters); strict mode mounts twice, hence the cleanup.
  useEffect(() => {
    if (!el.current || points.length === 0) return;
    const map = L.map(el.current, { scrollWheelZoom: false });
    map.attributionControl.setPrefix(false);
    L.tileLayer(TILES_URL, { attribution, maxZoom: 19 }).addTo(map);
    const bounds = L.latLngBounds([]);
    for (const p of points) {
      const icon = L.divIcon({ className: "", html: pinHtml(p.items.length, p.accentToken), iconSize: [34, 44], iconAnchor: [17, 43], popupAnchor: [0, -38] });
      const title = labelRef.current(p);
      L.marker([p.lat, p.lng], { icon, keyboard: true, title, alt: title })
        .bindPopup(popupContent(p), { className: "os-catalog-popup", maxWidth: 280 })
        .addTo(map);
      bounds.extend([p.lat, p.lng]);
    }
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    return () => {
      map.remove();
    };
  }, [points, attribution]);

  return (
    <>
      <style>{POPUP_CSS}</style>
      <div
        ref={el}
        role="region"
        aria-label={label}
        // Leaflet uses high z-indexes: keep them inside the map.
        className={`isolate z-0 w-full overflow-hidden rounded-[var(--radius-lg)] border-2 border-line ${className ?? ""}`}
        style={{ background: "var(--os-surface-2)" }}
      />
    </>
  );
}
