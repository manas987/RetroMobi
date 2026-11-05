import { useEffect, useState } from "react";
import { useLocation, useSearch as useLocationSearch } from "wouter";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { SlidersHorizontal } from "lucide-react";
import { SearchCapsule, type SearchCapsuleValue } from "../components/SearchCapsule";
import { FilterSheet } from "../components/FilterSheet";
import { MapPanel } from "../components/MapPanel";
import { VehicleCard } from "../components/VehicleCard";
import { SearchFailure, VehicleSkeletons } from "../components/SearchFeedback";
import { searchPresentation } from "../lib/searchPresentation";
import { useSearch } from "../lib/api";
import { useGeolocation } from "../lib/useGeolocation";
import { useMediaQuery } from "../lib/useMediaQuery";
import { DEFAULT_CITY, defaultWindow, parseSearchParams, toSearchParams, activeFilters } from "../lib/searchParams";
import type { SearchCriteria, SearchResult } from "../lib/types";

const EMPTY_RESULTS: SearchResult[] = [];

export function Browse() {
  const locationSearch = useLocationSearch();
  const [, navigate] = useLocation();
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<SearchResult | null>(null);
  const [focusedCard, setFocusedCard] = useState<SearchResult | null>(null);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const activeCard = hoveredCard ?? focusedCard;
  const activeShop = activeCard?.primaryOffer.shopId ?? selectedShop;

  // 660px of capsule plus the logo and the account cluster needs
  // about 1300px of bar. Under that the controls get their own strip. It is a
  // JS branch rather than `hidden`, so exactly one host exists at a time and
  // the header never renders an empty centre track.
  const inHeader = useMediaQuery("(min-width: 1300px)");

  const criteria = parseSearchParams(locationSearch);
  const geo = useGeolocation({ autoRequest: false });
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

  const query = useSearch(criteria, coords);
  const { data } = query;
  const { loading, failed, skeletonCount } = searchPresentation(query);
  const visibleResults = loading || failed ? EMPTY_RESULTS : data?.results ?? EMPTY_RESULTS;

  useEffect(() => {
    setHoveredCard(null);
    setFocusedCard(null);
    setSelectedShop(null);
  }, [locationSearch, loading, failed]);

  function update(patch: Partial<SearchCriteria>) {
    // "Distance" sort needs coordinates — fall back to price if we don't have them yet.
    if (patch.sort === "distance" && !coords) patch = { ...patch, sort: "price" };
    navigate(`/browse?${toSearchParams({ ...criteria, ...patch, page: 1 })}`, { replace: true });
  }

  const capsule = (
    <SearchCapsule
      compact
      className="min-[1300px]:w-[660px] max-w-full"
      initial={{ city: criteria.city, pickupAt: criteria.pickupAt, returnAt: criteria.returnAt }}
      onSearch={(v: SearchCapsuleValue) => update(v)}
    />
  );

  const filterButton = (
      <button
        type="button"
        onClick={() => setFiltersOpen(true)}
        className="h-11 px-5 shrink-0 rounded-full border border-line-strong text-ink text-[15px] font-medium hover:bg-surface-3 transition-colors flex items-center gap-2"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {activeFilters(criteria).length > 0 && (
          <span className="h-5 min-w-5 px-1 rounded-full bg-ink text-surface text-[11px] font-semibold flex items-center justify-center">
            {activeFilters(criteria).length}
          </span>
        )}
      </button>
  );

  return (
    /* The page scrolls normally and the map is sticky rather than fixed, which
       is what lets the footer arrive at the end and lift it with everything
       else. The header holds its own place — it is already sticky. */
    <div className="min-h-screen flex flex-col">
      <Header browse center={inHeader ? capsule : undefined} />

      {!inHeader && <div className="shrink-0 px-5 pt-3">{capsule}</div>}

      {/* Two numbers, not one: 40px to the window edges and between the two
          columns, 24px between cards. The reference uses that same ratio, and
          it is what binds the grid into a single column against the map — a
          card gap as wide as the outer gutter reads as four loose cards.

          The padding lives here rather than on the children so the cards column
          and the map panel end on exactly the same line.

          The gap goes to zero in fullscreen: at basis-0 the cards column is
          still in the flow, and a gutter beside nothing would double the map's
          left inset. */}
      <div className={`flex-1 flex items-start p-10 ${mapFullscreen ? "gap-0" : "gap-10"}`}>
        <p role="status" className="sr-only">{loading ? "Loading vehicles" : ""}</p>
        {/* Kept mounted and collapsed to basis-0 rather than unmounted: a width
            that animates has to have something to animate from, and the map's
            own invalidateSize fires at the tail of this same 300ms.

            grow only while the map is beside it — that is also what fills the
            row below lg, where the map column is display:none. */}
        <div
          role="region"
          aria-label="Vehicle results"
          aria-busy={loading}
          className={`-mt-[18px] min-w-0 transition-[flex-basis,opacity] duration-300 ease-out ${
            mapFullscreen ? "grow-0 basis-0 opacity-0 overflow-hidden" : "grow basis-[55%] opacity-100"
          }`}
        >
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="text-xl font-semibold text-ink" aria-live="polite">
              {!loading && !failed && data && (
                <span>{data.total} {data.total === 1 ? "vehicle" : "vehicles"}</span>
              )}
            </div>
            {filterButton}
          </div>

          {loading && <VehicleSkeletons count={skeletonCount} />}
          {failed && <SearchFailure onRetry={() => { void query.refetch({ cancelRefetch: false }); }} retrying={query.isFetching} />}

          {!loading && !failed && data?.results.length === 0 && (
            <p className="text-sm text-ink-3 py-16 text-center bg-surface-2 rounded-panel">
              No scooters match these filters yet. Try widening the dates, price range or city.
            </p>
          )}

          {/* Two up, like the reference: the column is just over half the
              window, and a third card there is narrower than the card was
              ever designed to be. */}
          {visibleResults.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {visibleResults.map((r) => (
                <div
                  key={`${r.model.id}:${r.primaryOffer.shopId}`}
                  onMouseEnter={() => setHoveredCard(r)}
                  onMouseLeave={() => setHoveredCard(null)}
                  onPointerDownCapture={() => setFocusedCard(null)}
                  onFocusCapture={(e) => setFocusedCard(e.target.matches(":focus-visible") ? r : null)}
                  onBlurCapture={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusedCard(null);
                  }}
                >
                  <VehicleCard result={r} highlighted={activeCard ? activeCard === r : selectedShop === r.primaryOffer.shopId} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          /* Sticky, not fixed: it holds its place while the cards scroll past
             it and then lifts with the page when the footer arrives — which is
             the whole reason the page scrolls rather than the cards column.

             Raise only the map 8px within this row, including its sticky offset. */
          className={`-mt-2 shrink-0 sticky top-[136px] h-[calc(100dvh-184px)] min-[1300px]:top-[130px] min-[1300px]:h-[calc(100dvh-178px)] transition-[flex-basis] duration-300 ease-out ${
            mapFullscreen ? "grow basis-full" : "hidden lg:block basis-[48%]"
          }`}
        >
          <MapPanel
            results={visibleResults}
            activeShopId={activeShop}
            onShopSelect={setSelectedShop}
            geo={geo}
            fullscreen={mapFullscreen}
            onToggleFullscreen={() => setMapFullscreen((f) => !f)}
            className="h-full rounded-panel border border-line"
          />
        </div>
      </div>

      <FilterSheet
        criteria={criteria}
        onChange={update}
        results={data?.results ?? []}
        priceHistogram={data?.priceHistogram ?? []}
        geo={geo}
        total={data?.total ?? 0}
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
      />

      <Footer />
    </div>
  );
}
