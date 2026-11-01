import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { rupees } from "../lib/format";
import type { SearchResult } from "../lib/types";
import { TILE_URL, TILE_ATTRIBUTION, TILE_MAX_ZOOM } from "../lib/mapTiles";

/** Uttarakhand — centres the map even before any shop is plotted. */
const DEFAULT_CENTER: L.LatLngTuple = [30.1, 78.4];

function pinIcon(): L.DivIcon {
  return L.divIcon({ className: "map-pin", iconSize: [22, 22], iconAnchor: [11, 22] });
}

export function MapPanel({
  results,
  onClose,
  fullscreen = false,
  onToggleFullscreen,
  className = "",
}: {
  results: SearchResult[];
  onClose: () => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { attributionControl: false, zoomControl: true }).setView(
      DEFAULT_CENTER,
      10,
    );
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: TILE_MAX_ZOOM, detectRetina: true }).addTo(map);
    mapRef.current = map;
    setReady(true);

    // Leaflet measures its container on init; a layout pass that lands a tick
    // later (common right after a conditional mount) otherwise leaves it sized 0.
    const resizeTimer = setTimeout(() => map.invalidateSize(), 0);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // The container's own size changes when toggling fullscreen (CSS width
  // change, not a remount), which Leaflet never notices on its own.
  useEffect(() => {
    if (!mapRef.current) return;
    const t = setTimeout(() => mapRef.current!.invalidateSize(), 320);
    return () => clearTimeout(t);
  }, [fullscreen]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const pins = results.filter(
      (r) => r.primaryOffer.shopLatitude != null && r.primaryOffer.shopLongitude != null,
    );
    for (const r of pins) {
      const marker = L.marker([r.primaryOffer.shopLatitude!, r.primaryOffer.shopLongitude!], {
        icon: pinIcon(),
      })
        .bindPopup(
          `<a class="map-popup-link" href="/vehicles/${r.primaryOffer.vehicleId}">` +
            `<strong>${r.model.make} ${r.model.model}</strong><br/>${r.primaryOffer.shopName} · ${rupees(r.primaryOffer.pricePerDay)}/day` +
            `</a>`,
        )
        .addTo(map);
      markersRef.current.push(marker);
    }

    if (pins.length > 0) {
      const bounds = L.latLngBounds(
        pins.map((r) => [r.primaryOffer.shopLatitude!, r.primaryOffer.shopLongitude!] as L.LatLngTuple),
      );
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
    }
  }, [ready, results]);

  return (
    <div
      className={`relative shrink-0 rounded-panel overflow-hidden border border-line transition-[width,height] duration-300 ease-[cubic-bezier(0.34,1.2,0.64,1)] ${
        fullscreen
          ? "w-full h-[calc(100dvh-320px)] lg:h-[calc(100vh-280px)]"
          : "w-full lg:w-[420px] h-[420px] lg:h-[560px] lg:sticky lg:top-24"
      } ${className}`}
    >
      <div ref={containerRef} className="absolute inset-0" />

      <button
        type="button"
        onClick={onClose}
        className="glass-panel absolute top-3 right-3 z-[1000] w-8 h-8 rounded-full flex items-center justify-center text-ink"
        aria-label="Close map"
      >
        ×
      </button>

      {onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="glass-panel absolute bottom-3 right-3 z-[1000] w-9 h-9 rounded-full flex items-center justify-center text-ink"
          aria-label={fullscreen ? "Collapse map" : "Expand map"}
          title={fullscreen ? "Collapse map" : "Expand map"}
        >
          {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      )}
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
