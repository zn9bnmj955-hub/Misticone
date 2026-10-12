"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Icon } from "@orgasport/ui";
import { getMessages } from "@/i18n";
import { Button } from "@/components/ui/Button";
import type { LatLng } from "./LeafletMap";

const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-72 place-items-center rounded-[var(--radius-lg)] border-2 border-line bg-surface-2 text-sm font-bold text-ink-soft">
      {getMessages().wizard.map.loading}
    </div>
  ),
});

/** Metropolitan France, when nothing better is known. */
const FRANCE: LatLng = { lat: 46.6, lng: 2.4 };

/**
 * Exact spot of the tournament: a draggable marker on a map that is loaded
 * only when asked for. The typed address stays the reference; the marker
 * adds directions to the right entrance.
 */
export function MapPicker({
  value,
  onChange,
  fallbackCenter,
}: {
  value: LatLng | null;
  onChange: (v: LatLng | null) => void;
  /** Where to open the map when no marker is placed yet (e.g. the club). */
  fallbackCenter?: LatLng | null;
}) {
  const t = getMessages().wizard.map;
  const [open, setOpen] = useState(false);
  const [gpsError, setGpsError] = useState(false);

  function locate() {
    setGpsError(false);
    if (!("geolocation" in navigator)) {
      setGpsError(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOpen(true);
        onChange({ lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 });
      },
      () => setGpsError(true),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const center = value ?? fallbackCenter ?? FRANCE;
  return (
    <div className="grid gap-3">
      <p className="flex items-center gap-2 text-sm">
        <Icon name="mapPin" size={18} className={value ? "text-accent-ink" : "text-ink-soft"} />
        <span className={value ? "font-bold" : "text-ink-soft"}>{value ? t.placed : t.notPlaced}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name="mapPin" size={20} />
          {open ? t.hide : t.show}
        </Button>
        <Button variant="ghost" onClick={locate}>
          <Icon name="target" size={20} />
          {t.myPosition}
        </Button>
        {value && (
          <Button variant="ghost" onClick={() => onChange(null)}>
            <Icon name="close" size={20} />
            {t.clear}
          </Button>
        )}
      </div>
      {gpsError && (
        <p role="status" className="text-sm font-bold text-danger">
          {t.positionError}
        </p>
      )}
      {open && (
        <div className="grid gap-2">
          <p className="text-sm text-ink-soft">{t.help}</p>
          <LeafletMap center={center} zoom={value ? 17 : fallbackCenter ? 15 : 5} marker={value} editable onPick={onChange} label={t.label} />
        </div>
      )}
    </div>
  );
}
