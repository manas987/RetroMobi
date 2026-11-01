import { useEffect, useState } from "react";
import { useLocation, useSearch as useLocationSearch } from "wouter";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { SlidersHorizontal } from "lucide-react";
import { SearchCapsule, type SearchCapsuleValue } from "../components/SearchCapsule";
import { FilterRail } from "../components/FilterRail";
import { MapPanel } from "../components/MapPanel";
import { VehicleCard } from "../components/VehicleCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useSearch } from "../lib/api";
import { useGeolocation } from "../lib/useGeolocation";
import { DEFAULT_CITY, defaultWindow, parseSearchParams, toSearchParams, activeFilters } from "../lib/searchParams";
import type { SearchCriteria, SortKey } from "../lib/types";

export function Browse() {
  const locationSearch = useLocationSearch();
  const [, navigate] = useLocation();
  const [mapOpen, setMapOpen] = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const criteria = parseSearchParams(locationSearch);
  const geo = useGeolocation();
  const coords = geo.status === "granted" ? { lat: geo.lat, lng: geo.lng } : null;

  // Reached with no query string (e.g. the header's bare "Browse scooters"
  // link) — parseSearchParams then defaults city to "", which the search
  // hook below treats as "nothing to search for" and silently shows nothing.
  // Give it a real starting point instead, reflected in the URL.
  useEffect(() => {
    if (!criteria.city) {
      const w = defaultWindow();
      navigate(
        `/browse?${toSearchParams({ city: DEFAULT_CITY, pickupAt: w.pickupAt, returnAt: w.returnAt, sort: "price", page: 1 })}`,
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criteria.city]);

  const { data, isLoading, isError } = useSearch(criteria, coords);

  function update(patch: Partial<SearchCriteria>) {
    // "Distance" sort needs coordinates — fall back to price if we don't have them yet.
    if (patch.sort === "distance" && !coords) patch = { ...patch, sort: "price" };
    navigate(`/browse?${toSearchParams({ ...criteria, ...patch, page: 1 })}`, { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="max-w-[1400px] w-full mx-auto px-5 py-5">
        <SearchCapsule
          compact
          initial={{ city: criteria.city, pickupAt: criteria.pickupAt, returnAt: criteria.returnAt }}
          onSearch={(v: SearchCapsuleValue) => update(v)}
        />
      </div>

      <div className="max-w-[1400px] w-full mx-auto px-5 pb-16 flex flex-col md:flex-row gap-8 items-start">
        <FilterRail
          criteria={criteria}
          onChange={update}
          results={data?.results ?? []}
          priceHistogram={data?.priceHistogram ?? []}
          geo={geo}
          mobileOpen={filtersOpen}
          onMobileOpenChange={setFiltersOpen}
        />

        <div className="flex-1 min-w-0 flex flex-col gap-4 w-full">
          {/* Stays full-width regardless of the map — only the row below is
              shared between the grid and the map panel. */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-3">
              {isLoading ? "Searching…" : `${data?.total ?? 0} result${data?.total === 1 ? "" : "s"} in ${criteria.city}`}
            </p>
            <div className="flex items-center gap-3">
              <SortSelect value={criteria.sort} onChange={(sort) => update({ sort })} distanceAvailable={!!coords} />
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="md:hidden h-9 w-9 shrink-0 rounded-full border border-line-strong text-ink hover:bg-surface-3 transition-colors flex items-center justify-center relative"
                aria-label="Filters"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilters(criteria).length > 0 && (
                  <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-amber text-on-amber text-[9px] font-semibold flex items-center justify-center">
                    {activeFilters(criteria).length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMapOpen((o) => !o);
                  setMapFullscreen(false);
                }}
                className={`h-9 px-3.5 rounded-full border text-sm font-medium flex items-center gap-1.5 transition-colors ${
                  mapOpen ? "bg-ink text-surface border-ink" : "border-line-strong text-ink hover:bg-surface-3"
                }`}
              >
                <MapIcon /> Map
              </button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 items-start w-full">
            {!mapFullscreen && (
              <div className={`flex-1 min-w-0 w-full ${mapOpen ? "order-2 lg:order-1" : ""}`}>
                {isError && (
                  <p className="text-sm text-danger bg-danger-soft rounded-panel px-4 py-3">
                    Couldn't reach the API. Is the backend running?
                  </p>
                )}

                {!isError && !isLoading && data?.results.length === 0 && (
                  <p className="text-sm text-ink-3 py-16 text-center bg-surface-2 rounded-panel">
                    No scooters match these filters yet. Try widening the dates, price range or city.
                  </p>
                )}

                {!isLoading && data && data.results.length > 0 && (
                  <div
                    className={`grid grid-cols-1 sm:grid-cols-2 ${mapOpen ? "" : "lg:grid-cols-3 2xl:grid-cols-4"} gap-5`}
                  >
                    {data.results.map((r) => (
                      <VehicleCard key={`${r.model.id}:${r.primaryOffer.shopId}`} result={r} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {mapOpen && (
              <MapPanel
                results={data?.results ?? []}
                onClose={() => {
                  setMapOpen(false);
                  setMapFullscreen(false);
                }}
                fullscreen={mapFullscreen}
                onToggleFullscreen={() => setMapFullscreen((f) => !f)}
                className="order-1 lg:order-2"
              />
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function SortSelect({
  value,
  onChange,
  distanceAvailable,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
  distanceAvailable: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SortKey)}>
      <SelectTrigger className="min-w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="price">Price: low to high</SelectItem>
        <SelectItem value="rating">Rating</SelectItem>
        <SelectItem value="distance" disabled={!distanceAvailable}>
          Distance{distanceAvailable ? "" : " (needs location)"}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function MapIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
