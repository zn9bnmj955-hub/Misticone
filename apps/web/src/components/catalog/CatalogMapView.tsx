"use client";
import dynamic from "next/dynamic";
import { useCallback } from "react";
import type { MapPoint } from "./model";

const SIZE = "h-[min(65vh,34rem)] min-h-80";

const CatalogMap = dynamic(() => import("./CatalogMap"), {
  ssr: false,
  loading: () => <div className={`${SIZE} animate-pulse rounded-[var(--radius-lg)] bg-surface-2`} aria-hidden="true" />,
});

/** Map of the catalog (« Carte » view). Leaflet is fetched only when this renders. */
export function CatalogMapView({
  points,
  label,
  attribution,
  pinTemplate,
}: {
  points: MapPoint[];
  label: string;
  attribution: string;
  /** « {count} concours à {city} » */
  pinTemplate: string;
}) {
  const pinLabel = useCallback(
    (p: MapPoint) =>
      p.items.length === 1 ? p.items[0]!.name : pinTemplate.replace("{count}", String(p.items.length)).replace("{city}", p.city ?? ""),
    [pinTemplate],
  );
  return <CatalogMap points={points} label={label} attribution={attribution} pinLabel={pinLabel} className={SIZE} />;
}
