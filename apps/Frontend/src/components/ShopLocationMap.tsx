import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILE_URL, TILE_ATTRIBUTION, TILE_MAX_ZOOM } from "../lib/mapTiles";
import { MapZoomControls } from "./MapZoomControls";

/** A single, fixed pin for one shop — the detail page's smaller, simpler
 *  cousin of the browse page's multi-pin MapPanel. */
export function ShopLocationMap({
  latitude,
  longitude,
  label,
  fill = false,
}: {
  latitude: number;
  longitude: number;
  label: string;
  fill?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      attributionControl: false,
      zoomControl: false,
      dragging: true,
      scrollWheelZoom: false,
    }).setView([latitude, longitude], 14);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: TILE_MAX_ZOOM, detectRetina: true }).addTo(map);
    const popup = document.createElement("span");
    popup.textContent = label;
    L.marker([latitude, longitude], {
      icon: L.divIcon({ className: "map-pin", iconSize: [22, 22], iconAnchor: [11, 22] }),
    })
      .bindPopup(popup)
      .addTo(map);
    mapRef.current = map;

    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude, label]);

  return (
    <div className={`relative isolate rounded-panel overflow-hidden border border-line h-[260px] ${fill ? "lg:absolute lg:inset-0 lg:h-auto" : ""}`}>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute top-3 right-3 z-[1000]">
        <MapZoomControls compact onZoomIn={() => mapRef.current?.zoomIn()} onZoomOut={() => mapRef.current?.zoomOut()} />
      </div>
    </div>
  );
}
