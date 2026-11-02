import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Navigation, Plus, Minus } from "lucide-react";
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
  coords = null,
  fullscreen = false,
  onToggleFullscreen,
  className = "",
}: {
  results: SearchResult[];
  /** Already-granted position from the page's own `useGeolocation`. The locate
   *  button re-centres on it rather than calling `map.locate()`, which would
   *  put a second permission prompt in front of someone who answered once. */
  coords?: { lat: number; lng: number } | null;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** Size and decoration both come from here — the panel has no dimensions of
   *  its own, so it fills whatever column Browse gives it. */
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // zoomControl off: + and − are ours, in one stack with expand and locate.
    const map = L.map(containerRef.current, { attributionControl: false, zoomControl: false }).setView(
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

  // The parent's column width changes when toggling fullscreen (CSS width
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
    /* isolate, because Leaflet numbers its own layers from the root: panes sit
       at z-index 400 and controls at 800, and with no stacking context here
       those compete directly with portalled overlays — the search capsule's
       calendar is z-50, so the map painted straight over it. One stacking
       context keeps every Leaflet number local, for every overlay at once. */
    <div className={`relative isolate overflow-hidden ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />

      {/* One stack, two groups: expand stands alone because it changes the
          page, while locate and zoom only move the map. */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-2">
        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className={`${CHROME} ${CHROME_SHADOW} w-11 h-11 rounded-full`}
            aria-label={fullscreen ? "Collapse map" : "Expand map"}
            title={fullscreen ? "Collapse map" : "Expand map"}
          >
            {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
          </button>
        )}

        <div className={`rounded-full bg-surface ${CHROME_SHADOW} overflow-hidden flex flex-col divide-y divide-line`}>
          <button
            type="button"
            onClick={() => coords && mapRef.current?.setView([coords.lat, coords.lng], 14)}
            disabled={!coords}
            className={`${CHROME} w-11 h-11 disabled:opacity-35 disabled:cursor-not-allowed`}
            aria-label="Centre on my location"
            title={coords ? "Centre on my location" : "Location unavailable"}
          >
            <Navigation className="h-[18px] w-[18px] -rotate-45" />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            className={`${CHROME} w-11 h-11`}
            aria-label="Zoom in"
          >
            <Plus className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            className={`${CHROME} w-11 h-11`}
            aria-label="Zoom out"
          >
            <Minus className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* Shared by every control in the stack. Rounding and shadow belong to the
   group — the pill carries one for all three of its buttons — so this is just
   the surface. */
const CHROME = "bg-surface text-ink flex items-center justify-center hover:bg-surface-3 transition-colors";
const CHROME_SHADOW = "shadow-[0_2px_8px_rgba(18,22,26,0.18)]";

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
