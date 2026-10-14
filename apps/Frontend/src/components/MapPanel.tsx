import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { rupees } from "../lib/format";
import type { SearchResult } from "../lib/types";

/** Uttarakhand — centres the map even before any shop is plotted. */
const DEFAULT_CENTER: L.LatLngTuple = [30.1, 78.4];

// OpenTopoMap: free, no API key, and its green contour shading matches the
// brand's "realistic terrain map" commitment better than a flat street layer.
const TILE_URL = "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
  '<a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)';

function pinIcon(): L.DivIcon {
  return L.divIcon({ className: "map-pin", iconSize: [22, 22], iconAnchor: [11, 22] });
}

export function MapPanel({ results, onClose }: { results: SearchResult[]; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { attributionControl: true, zoomControl: true }).setView(
      DEFAULT_CENTER,
      10,
    );
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 17 }).addTo(map);
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
          `<strong>${r.model.make} ${r.model.model}</strong><br/>${r.primaryOffer.shopName} · ${rupees(r.primaryOffer.pricePerDay)}/day`,
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
    <div className="relative w-full lg:w-[420px] shrink-0 rounded-panel overflow-hidden border border-line h-[420px] lg:h-[560px] lg:sticky lg:top-24">
      <div ref={containerRef} className="absolute inset-0" />

      <button
        type="button"
        onClick={onClose}
        className="glass-panel absolute top-3 right-3 z-[1000] w-8 h-8 rounded-full flex items-center justify-center text-ink"
        aria-label="Close map"
      >
        ×
      </button>

      <div className="glass-panel absolute left-3 bottom-3 right-3 lg:right-auto z-[1000] rounded-panel px-3 py-2 text-xs text-ink-2">
        {results.length} {results.length === 1 ? "scooter" : "scooters"} shown · pins are shop pick-up points
      </div>
    </div>
  );
}
