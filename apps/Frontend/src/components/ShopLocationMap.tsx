import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILE_URL, TILE_ATTRIBUTION, TILE_MAX_ZOOM } from "../lib/mapTiles";

/** A single, fixed pin for one shop — the detail page's smaller, simpler
 *  cousin of the browse page's multi-pin MapPanel. */
export function ShopLocationMap({
  latitude,
  longitude,
  label,
}: {
  latitude: number;
  longitude: number;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      attributionControl: false,
      zoomControl: true,
      dragging: true,
      scrollWheelZoom: false,
    }).setView([latitude, longitude], 14);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: TILE_MAX_ZOOM, detectRetina: true }).addTo(map);
    L.marker([latitude, longitude], {
      icon: L.divIcon({ className: "map-pin", iconSize: [22, 22], iconAnchor: [11, 22] }),
    })
      .bindPopup(label)
      .addTo(map);
    mapRef.current = map;

    const t = setTimeout(() => map.invalidateSize(), 0);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative rounded-panel overflow-hidden border border-line h-[260px]">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
