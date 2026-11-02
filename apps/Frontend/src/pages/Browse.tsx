import { useEffect, useState } from "react";
import { useLocation, useSearch as useLocationSearch } from "wouter";
import { Header } from "../components/Header";
import { SlidersHorizontal } from "lucide-react";
import { SearchCapsule, type SearchCapsuleValue } from "../components/SearchCapsule";
import { FilterSheet } from "../components/FilterSheet";
import { MapPanel } from "../components/MapPanel";
import { VehicleCard } from "../components/VehicleCard";
import { useSearch } from "../lib/api";
import { useGeolocation } from "../lib/useGeolocation";
import { useMediaQuery } from "../lib/useMediaQuery";
import { DEFAULT_CITY, defaultWindow, parseSearchParams, toSearchParams, activeFilters } from "../lib/searchParams";
import type { SearchCriteria } from "../lib/types";

export function Browse() {
  const locationSearch = useLocationSearch();
  const [, navigate] = useLocation();
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // 660px of capsule plus the logo, two pills and the account cluster needs
  // about 1300px of bar. Under that the controls get their own strip. It is a
  // JS branch rather than `hidden`, so exactly one host exists at a time and
  // the header never renders an empty centre track.
  const inHeader = useMediaQuery("(min-width: 1300px)");

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

  const capsule = (
    <SearchCapsule
      compact
      className="min-[1300px]:w-[660px] max-w-full"
      initial={{ city: criteria.city, pickupAt: criteria.pickupAt, returnAt: criteria.returnAt }}
      onSearch={(v: SearchCapsuleValue) => update(v)}
    />
  );

  // One group, centred: the capsule and the one pill that opens everything
  // else. Sort moved inside that sheet, so there is nothing else out here.
  const controls = (
    /* items-stretch, not a height on the pill: the capsule sets the group's
       height and the pill inherits it, so the two stay flush if its padding
       ever changes again. */
    <div className="flex items-stretch gap-3">
      {capsule}
      <button
        type="button"
        onClick={() => setFiltersOpen(true)}
        className="px-5 shrink-0 rounded-full border border-line-strong text-ink text-[15px] font-medium hover:bg-surface-3 transition-colors flex items-center gap-2"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {activeFilters(criteria).length > 0 && (
          <span className="h-5 min-w-5 px-1 rounded-full bg-ink text-surface text-[11px] font-semibold flex items-center justify-center">
            {activeFilters(criteria).length}
          </span>
        )}
      </button>
    </div>
  );

  return (
    /* The page itself does not scroll: the header and the controls row are
       fixed by being the non-growing children of a viewport-tall column, and
       the cards column below is the only thing with an overflow. That is what
       lets the map hold still beside it. */
    <div className="h-dvh flex flex-col overflow-hidden">
      <Header center={inHeader ? controls : undefined} />

      {!inHeader && <div className="shrink-0 border-b border-line px-5 py-3">{controls}</div>}

      {/* Two numbers, not one: 40px to the window edges and between the two
          columns, 24px between cards. The reference uses that same ratio, and
          it is what binds the grid into a single column against the map — a
          card gap as wide as the outer gutter reads as four loose cards.

          The padding lives here rather than on the children so the cards column
          and the map panel end on exactly the same line.

          The gap goes to zero in fullscreen: at basis-0 the cards column is
          still in the flow, and a gutter beside nothing would double the map's
          left inset. */}
      <div className={`flex-1 min-h-0 flex p-10 ${mapFullscreen ? "gap-0" : "gap-10"}`}>
        {/* Kept mounted and collapsed to basis-0 rather than unmounted: a width
            that animates has to have something to animate from, and the map's
            own invalidateSize fires at the tail of this same 300ms.

            grow only while the map is beside it — that is also what fills the
            row below lg, where the map column is display:none. */}
        <div
          className={`min-w-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden transition-[flex-basis,opacity] duration-300 ease-out ${
            mapFullscreen ? "grow-0 basis-0 opacity-0 overflow-hidden" : "grow basis-[55%] opacity-100"
          }`}
        >
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

          {/* Two up, like the reference: the column is just over half the
              window, and a third card there is narrower than the card was
              ever designed to be. */}
          {!isLoading && data && data.results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {data.results.map((r) => (
                <VehicleCard key={`${r.model.id}:${r.primaryOffer.shopId}`} result={r} />
              ))}
            </div>
          )}
        </div>

        <div
          /* A share of the width, with the height coming free from the row's
             align-items: stretch — so the map fills top to bottom and ends up
             slightly taller than wide, as in the reference. aspect-square did
             the opposite, deriving width from height, which left white space
             under it on a tall window. */
          className={`shrink-0 transition-[flex-basis] duration-300 ease-out ${
            mapFullscreen ? "grow basis-full" : "hidden lg:block basis-[48%]"
          }`}
        >
          <MapPanel
            results={data?.results ?? []}
            coords={coords}
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
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
      />
    </div>
  );
}
