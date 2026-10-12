"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { getMessages } from "@/i18n";
import { cn } from "@/components/ui/cn";

const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-full min-h-48 animate-pulse rounded-[var(--radius-lg)] bg-surface-2" aria-hidden="true" />,
});

/**
 * Read-only map with one marker (tournament or club location). Leaflet is
 * fetched only when this component is rendered on the client.
 */
export function MapView({
  lat,
  lng,
  zoom = 15,
  label = getMessages().wizard.map.label,
  className,
}: {
  lat: number;
  lng: number;
  zoom?: number;
  label?: string;
  className?: string;
}) {
  const point = useMemo(() => ({ lat, lng }), [lat, lng]);
  return <LeafletMap center={point} zoom={zoom} marker={point} label={label} className={cn("h-64", className)} />;
}
