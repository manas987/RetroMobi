import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { rupees } from "../lib/format";
import type { SearchResult } from "../lib/types";
import { TILE_URL, TILE_ATTRIBUTION, TILE_MAX_ZOOM } from "../lib/mapTiles";
import { mapShops } from "../lib/mapShops";
import type { GeolocationController } from "../lib/useGeolocation";
import { MapLocationControl } from "./MapLocationControl";
import { MapShopPreview } from "./MapShopPreview";
import { MapZoomControls, mapControlButtonClass, mapControlShadowClass } from "./MapZoomControls";

/** Uttarakhand — centres the map even before any shop is plotted. */
const DEFAULT_CENTER: L.LatLngTuple = [30.1, 78.4];

function priceIcon(price: number): L.DivIcon {
  const label = document.createElement("span");
  label.className = "map-price-label";
  label.textContent = rupees(price);
  return L.divIcon({ className: "map-price-pin", html: label, iconSize: [0, 32], iconAnchor: [0, 16] });
}

export function MapPanel({
  results,
  geo,
  fullscreen = false,
  onToggleFullscreen,
  className = "",
  activeShopId = null,
  onShopSelect,
}: {
  results: SearchResult[];
  geo: GeolocationController;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** Size and decoration both come from here — the panel has no dimensions of
   *  its own, so it fills whatever column Browse gives it. */
  className?: string;
  activeShopId?: string | null;
  onShopSelect?: (shopId: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ shopId: string; marker: L.Marker }[]>([]);
  const fittedShops = useRef("");
  const [ready, setReady] = useState(false);
  const selectedMarker = useRef<L.Marker | null>(null);
  const [preview, setPreview] = useState<{ shopId: string; marker: L.Marker; container: HTMLDivElement } | null>(null);

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
      fittedShops.current = "";
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
    for (const { marker } of markersRef.current) marker.remove();
    markersRef.current = [];

    const shops = mapShops(results);
    for (const shop of shops) {
      const container = document.createElement("div");
      const marker = L.marker([shop.latitude, shop.longitude], {
        icon: priceIcon(shop.pricePerDay),
        riseOnHover: true,
        alt: `${shop.name}, show matching vehicles`,
      })
        .bindPopup(container, {
          className: "map-vehicle-popup", closeButton: false, minWidth: 280, maxWidth: 300,
          autoPanPaddingTopLeft: [16, 16], autoPanPaddingBottomRight: [72, 16],
        })
        .on("popupopen", () => {
          selectedMarker.current = marker;
          setPreview({ shopId: shop.shopId, marker, container });
          onShopSelect?.(shop.shopId);
        })
        .on("popupclose", () => {
          if (selectedMarker.current !== marker) return;
          selectedMarker.current = null;
          setPreview(null);
          onShopSelect?.(null);
        })
        .addTo(map);
      marker.getElement()?.setAttribute("aria-label", `${shop.name}, starting at ${rupees(shop.pricePerDay)} per day. Show vehicles.`);
      markersRef.current.push({ shopId: shop.shopId, marker });
    }

    const positions = JSON.stringify(shops
      .map(({ shopId, latitude, longitude }) => ({ shopId, latitude, longitude }))
      .sort((a, b) => a.shopId.localeCompare(b.shopId)));
    if (shops.length > 0 && positions !== fittedShops.current) {
      const bounds = L.latLngBounds(
        shops.map((shop) => [shop.latitude, shop.longitude] as L.LatLngTuple),
      );
      map.fitBounds(bounds, { padding: [88, 64], maxZoom: 14 });
      fittedShops.current = positions;
    }
  }, [ready, results, onShopSelect]);

  useLayoutEffect(() => {
    if (!preview) return;
    const popup = preview.marker.getPopup();
    const observer = new ResizeObserver(() => popup?.update());
    observer.observe(preview.container);
    popup?.update();
    preview.container.querySelector<HTMLButtonElement>("button[aria-label='Close shop preview']")?.focus({ preventScroll: true });
    return () => observer.disconnect();
  }, [preview]);

  useEffect(() => {
    for (const { shopId, marker } of markersRef.current) {
      const active = shopId === activeShopId || shopId === preview?.shopId;
      marker.getElement()?.classList.toggle("is-active", active);
      marker.setZIndexOffset(active ? 1000 : 0);
      if (shopId === activeShopId) {
        // panInside moves only when needed; padding keeps the whole label clear of edges and controls.
        mapRef.current?.panInside(marker.getLatLng(), {
          paddingTopLeft: [120, 72],
          paddingBottomRight: [160, 40],
          animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          duration: 0.25,
        });
      }
    }
  }, [activeShopId, ready, results, onShopSelect, preview]);

  return (
    /* isolate, because Leaflet numbers its own layers from the root: panes sit
       at z-index 400 and controls at 800, and with no stacking context here
       those compete directly with portalled overlays — the search capsule's
       calendar is z-50, so the map painted straight over it. One stacking
       context keeps every Leaflet number local, for every overlay at once. */
    <div className={`relative isolate overflow-hidden ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {preview && createPortal(
        <MapShopPreview key={preview.shopId} results={results.filter((r) => r.primaryOffer.shopId === preview.shopId)}
          onClose={() => { mapRef.current?.closePopup(); preview.marker.getElement()?.focus({ preventScroll: true }); }} />,
        preview.container,
      )}

      {/* One stack, two groups: expand stands alone because it changes the
          page, while locate and zoom only move the map. */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-2">
        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className={`${mapControlButtonClass} ${mapControlShadowClass} rounded-full`}
            aria-label={fullscreen ? "Collapse map" : "Expand map"}
            title={fullscreen ? "Collapse map" : "Expand map"}
          >
            {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
          </button>
        )}

        <MapZoomControls onZoomIn={() => mapRef.current?.zoomIn()} onZoomOut={() => mapRef.current?.zoomOut()}>
          <MapLocationControl geo={geo} className={mapControlButtonClass}
            onLocate={({ lat, lng }) => mapRef.current?.setView([lat, lng], 14)} />
        </MapZoomControls>
      </div>
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
