"use client";
import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@orgasport/ui";

/**
 * The map module (and Leaflet behind it) is fetched only when the map comes
 * near the screen: the top of the page stays light on phones.
 */
const MapView = dynamic(() => import("@/components/map/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <Placeholder />,
});

function Placeholder({ children }: { children?: ReactNode }) {
  return (
    <div className="grid h-56 place-items-center rounded-[var(--radius-lg)] border-2 border-line bg-surface-2 text-ink-soft sm:h-64">
      {children ?? <Icon name="mapPin" size={32} />}
    </div>
  );
}

/** A map must never break the page (blocked tiles, failed chunk): show the pin instead. */
class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Placeholder /> : this.props.children;
  }
}

export function LazyMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setNear(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {near ? (
        <MapBoundary>
          <MapView lat={lat} lng={lng} zoom={15} label={label} className="h-56 sm:h-64" />
        </MapBoundary>
      ) : (
        <Placeholder />
      )}
    </div>
  );
}
