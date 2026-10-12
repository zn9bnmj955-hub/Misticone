"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { getMessages } from "@/i18n";
import { cn } from "@/components/ui/cn";

/**
 * Leaflet map, loaded on demand only (see MapPicker / MapView): Leaflet and
 * its CSS never weigh on pages without a map. Tiles come from
 * NEXT_PUBLIC_MAP_TILES_URL (OpenStreetMap by default); when they cannot be
 * loaded the map stays usable as a plain surface and nothing breaks.
 */
export type LatLng = { lat: number; lng: number };

const TILES_URL = process.env.NEXT_PUBLIC_MAP_TILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || getMessages().wizard.map.attribution;

/** Pin drawn in the sport's accent color (tokens only). */
const PIN_HTML =
  '<span class="block text-accent" style="filter: drop-shadow(0 2px 2px var(--os-line))">' +
  '<svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true"><path d="M17 1C8.2 1 1 8 1 16.8 1 28.6 17 43 17 43s16-14.4 16-26.2C33 8 25.8 1 17 1z" fill="currentColor" style="stroke: var(--os-ink); stroke-width: 2"/>' +
  '<circle cx="17" cy="17" r="6" style="fill: var(--os-surface)"/></svg></span>';

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const same = (a: LatLng | null, b: LatLng | null) => a === b || (a !== null && b !== null && a.lat === b.lat && a.lng === b.lng);

export default function LeafletMap({
  center,
  zoom,
  marker,
  editable = false,
  onPick,
  label,
  className,
}: {
  center: LatLng;
  zoom: number;
  marker: LatLng | null;
  /** Touching the map places the marker, which can then be dragged. */
  editable?: boolean;
  onPick?: (p: LatLng) => void;
  label: string;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const picked = useRef<LatLng | null>(null);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  // Create the map once; React strict mode mounts twice, hence the cleanup.
  const initial = useRef({ center, zoom });
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { center: initial.current.center, zoom: initial.current.zoom, scrollWheelZoom: false });
    m.attributionControl.setPrefix(false);
    L.tileLayer(TILES_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    if (editable) {
      m.on("click", (e: L.LeafletMouseEvent) => {
        const p = { lat: round(e.latlng.lat), lng: round(e.latlng.lng) };
        picked.current = p;
        onPickRef.current?.(p);
      });
    }
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      pin.current = null;
    };
  }, [editable]);

  // Keep the marker in sync; follow it when it moved from outside (address, GPS).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!marker) {
      pin.current?.remove();
      pin.current = null;
      return;
    }
    if (!pin.current) {
      const icon = L.divIcon({ className: "", html: PIN_HTML, iconSize: [34, 44], iconAnchor: [17, 43] });
      const p = L.marker(marker, { icon, draggable: editable, keyboard: true, title: label, alt: label }).addTo(m);
      p.on("dragend", () => {
        const at = p.getLatLng();
        const next = { lat: round(at.lat), lng: round(at.lng) };
        picked.current = next;
        onPickRef.current?.(next);
      });
      pin.current = p;
    } else {
      pin.current.setLatLng(marker);
    }
    if (!same(picked.current, marker)) m.setView(marker, Math.max(m.getZoom(), 16));
    picked.current = null;
  }, [marker, editable, label]);

  return (
    <div
      ref={el}
      role="region"
      aria-label={label}
      // Leaflet uses high z-indexes: keep them inside the map.
      className={cn("isolate z-0 h-72 w-full overflow-hidden rounded-[var(--radius-lg)] border-2 border-line", className)}
      style={{ background: "var(--os-surface-2)" }}
    />
  );
}
