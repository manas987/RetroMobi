import { useState } from "react";
import { useLocation, useSearch as useLocationSearch } from "wouter";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { SearchCapsule, type SearchCapsuleValue } from "../components/SearchCapsule";
import { FilterRail } from "../components/FilterRail";
import { MapPanel } from "../components/MapPanel";
import { VehicleCard } from "../components/VehicleCard";
import { useSearch } from "../lib/api";
import { parseSearchParams, toSearchParams } from "../lib/searchParams";
import type { SearchCriteria, SortKey } from "../lib/types";

export function Browse() {
  const locationSearch = useLocationSearch();
  const [, navigate] = useLocation();
  const [mapOpen, setMapOpen] = useState(false);

  const criteria = parseSearchParams(locationSearch);
  const { data, isLoading, isError } = useSearch(criteria);

  function update(patch: Partial<SearchCriteria>) {
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

      <div className="max-w-[1400px] w-full mx-auto px-5 pb-16 flex flex-col lg:flex-row gap-8 items-start">
        <FilterRail criteria={criteria} onChange={update} />

        <div className="flex-1 min-w-0 flex flex-col lg:flex-row gap-6 items-start w-full">
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-ink-3">
                {isLoading ? "Searching…" : `${data?.total ?? 0} result${data?.total === 1 ? "" : "s"} in ${criteria.city}`}
              </p>
              <div className="flex items-center gap-3">
                <SortSelect value={criteria.sort} onChange={(sort) => update({ sort })} />
                <button
                  type="button"
                  onClick={() => setMapOpen((o) => !o)}
                  className={`h-9 px-3.5 rounded-full border text-sm font-medium flex items-center gap-1.5 transition-colors ${
                    mapOpen ? "bg-ink text-surface border-ink" : "border-line-strong text-ink hover:bg-surface-3"
                  }`}
                >
                  <MapIcon /> Map
                </button>
              </div>
            </div>

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
                className={`grid grid-cols-1 sm:grid-cols-2 ${mapOpen ? "" : "xl:grid-cols-3"} gap-5`}
              >
                {data.results.map((r) => (
                  <VehicleCard key={r.model.id} result={r} />
                ))}
              </div>
            )}
          </div>

          {mapOpen && <MapPanel results={data?.results ?? []} onClose={() => setMapOpen(false)} />}
        </div>
      </div>

      <Footer />
    </div>
  );
}

function SortSelect({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      className="h-9 px-3 rounded-full border border-line-strong text-sm text-ink bg-surface outline-none"
    >
      <option value="price">Price: low to high</option>
      <option value="rating">Rating</option>
      <option value="distance">Distance</option>
    </select>
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
