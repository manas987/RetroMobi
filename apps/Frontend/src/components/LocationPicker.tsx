import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TILE_URL, TILE_ATTRIBUTION, TILE_MAX_ZOOM } from "../lib/mapTiles";

const DEFAULT_CENTER: L.LatLngTuple = [30.1, 78.4]; // Uttarakhand, same fallback as MapPanel

function pinIcon(): L.DivIcon {
  return L.divIcon({ className: "map-pin", iconSize: [22, 22], iconAnchor: [11, 22] });
}

/**
 * A branch's exact coordinates, set by dragging a pin or clicking the map —
 * or by "Use my current location" when the merchant is physically at the
 * shop. Nothing round-trips through text inputs; lat/lng are only ever
 * produced by the map or the browser's geolocation.
 */
export function LocationPicker({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center: L.LatLngTuple = latitude != null && longitude != null ? [latitude, longitude] : DEFAULT_CENTER;
    const map = L.map(containerRef.current, { attributionControl: false, zoomControl: true }).setView(
      center,
      latitude != null ? 15 : 10,
    );
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: TILE_MAX_ZOOM, detectRetina: true }).addTo(map);

    if (latitude != null && longitude != null) {
      markerRef.current = L.marker([latitude, longitude], { icon: pinIcon(), draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current!.getLatLng();
        onChange(pos.lat, pos.lng);
      });
    }

    map.on("click", (e: L.LeafletMouseEvent) => {
      onChange(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    // Leaflet only notices window resizes; the card can change width on its own
    // (layout settling, container queries), which leaves tiles misplaced.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Only the initial value seeds the map; afterward the marker effect below
    // keeps it in sync without re-creating the map on every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (latitude == null || longitude == null) return;
    const pos: L.LatLngTuple = [latitude, longitude];
    if (markerRef.current) {
      markerRef.current.setLatLng(pos);
    } else {
      markerRef.current = L.marker(pos, { icon: pinIcon(), draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current!.getLatLng();
        onChange(p.lat, p.lng);
      });
    }
    map.setView(pos, Math.max(map.getZoom(), 15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocateError("This browser can't share your location.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setLocating(false);
        setLocateError(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't get your location.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-ink-3">Map location</span>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="text-xs font-medium text-ink hover:underline disabled:opacity-40"
        >
          {locating ? "Locating…" : "Use my current location"}
        </button>
      </div>
      <div className="relative isolate rounded-row overflow-hidden border border-line-strong h-[220px]">
        <div ref={containerRef} className="absolute inset-0" />
      </div>
      {locateError && <p className="text-xs text-danger mt-1">{locateError}</p>}
      <p className="text-xs text-ink-4 mt-1">
        {latitude != null && longitude != null
          ? "Drag the pin or click the map to adjust."
          : "Click the map to drop a pin, or use your current location."}
      </p>
    </div>
  );
}
