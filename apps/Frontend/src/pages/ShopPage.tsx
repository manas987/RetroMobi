import { useEffect, useRef } from "react";
import { useLocation, useParams, useSearch as useLocationSearch } from "wouter";
import { Phone, MapPin, ShieldCheck, Star, Clock, ArrowLeft } from "lucide-react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { VehicleCard } from "../components/VehicleCard";
import { EmptyState, feedbackActionClass, LoadingSkeleton, SkeletonBlock } from "../components/ContentFeedback";
import { SearchFailure, VehicleSkeletons } from "../components/SearchFeedback";
import { ShopLocationMap } from "../components/ShopLocationMap";
import { ReviewsSection } from "../components/ReviewsSection";
import { DateRangeField } from "../components/DateRangeField";
import { combine, splitIso } from "../components/DateTimeField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useSearch, useShopProfile } from "../lib/api";
import { useGeolocation } from "../lib/useGeolocation";
import { searchPresentation } from "../lib/searchPresentation";
import { bodyTypeLabel, parseSearchParams, toIsoWithOffset, toSearchParams } from "../lib/searchParams";
import type { SearchCriteria, ShopProfile, SortKey } from "../lib/types";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ShopPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const locationSearch = useLocationSearch();
  const [, navigate] = useLocation();
  const datesRef = useRef<{ openDates: () => void }>(null);
  const reviewBookingId = new URLSearchParams(locationSearch).get("reviewBooking");

  const criteria = parseSearchParams(locationSearch);
  // Every vehicle on this page is at the same shop, so a distance sort inherited from Browse is redundant.
  const sort = criteria.sort === "distance" ? "price" : criteria.sort;
  const selectedTypes = criteria.bodyType ?? [];
  const geo = useGeolocation();
  const coords = geo.status === "granted" ? { lat: geo.lat, lng: geo.lng } : null;

  // Pin this page's shopId into the URL the same way Browse seeds a default
  // city — so refreshing or sharing the link keeps the same shop scoped.
  useEffect(() => {
    if (criteria.shopId !== shopId || criteria.sort !== sort) {
      const params = new URLSearchParams(toSearchParams({ ...criteria, sort, shopId, city: "", page: 1 }));
      if (reviewBookingId) params.set("reviewBooking", reviewBookingId);
      navigate(`/shops/${shopId}?${params}${reviewBookingId ? "#shop-reviews" : ""}`, {
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, criteria.shopId, criteria.sort, sort]);

  const shopQuery = useShopProfile(shopId);
  const { data: shop, isLoading: shopLoading, isError: shopError } = shopQuery;
  const inventory = useSearch({ ...criteria, sort, shopId, city: "" }, coords);
  const { data } = inventory;
  const { loading, failed, skeletonCount } = searchPresentation(inventory);

  function update(patch: Partial<SearchCriteria>) {
    navigate(`/shops/${shopId}?${toSearchParams({ ...criteria, ...patch, shopId, city: "", page: 1 })}`, {
      replace: true,
    });
  }

  const pickup = splitIso(criteria.pickupAt);
  const ret = splitIso(criteria.returnAt);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="max-w-[1180px] w-full mx-auto px-5 py-6 flex-1">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/browse"))}
          className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to browse
        </button>

        {!shop && shopError && (
          <div className="mt-6">
            <SearchFailure title="We couldn’t load this shop" onRetry={() => void shopQuery.refetch({ cancelRefetch: false })} retrying={shopQuery.isFetching} />
          </div>
        )}

        {shopLoading && (
          <LoadingSkeleton label="Loading shop details" className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              <SkeletonBlock className="h-8 w-2/5" />
              <SkeletonBlock className="h-4 w-3/5" />
              <div className="mt-5 space-y-5 rounded-panel border border-line p-4">
                <SkeletonBlock className="h-5 w-4/5" />
                <SkeletonBlock className="h-5 w-2/3" />
                <SkeletonBlock className="h-5 w-1/2" />
              </div>
            </div>
            <SkeletonBlock className="h-44 rounded-panel" />
          </LoadingSkeleton>
        )}

        {shop && <ShopHeader shop={shop} />}

        <section className="mt-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-semibold text-ink">
                Vehicles at {shop?.name ?? "this shop"}
              </h2>
              <p className="text-sm text-ink-3 mt-0.5">
                {loading
                  ? "Checking availability…"
                  : !failed && data ? `${data.total} available for these dates` : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-12 min-w-0 items-center rounded-full border border-line-strong bg-surface px-3.5 text-sm transition-colors hover:bg-surface-3 has-[:focus-visible]:outline">
                <DateRangeField
                  ref={datesRef}
                  label=""
                  pickupDate={pickup.date}
                  pickupTime={pickup.time}
                  returnDate={ret.date}
                  returnTime={ret.time}
                  onDatesChange={(from, to) => update({
                    pickupAt: toIsoWithOffset(combine(from, pickup.time)),
                    returnAt: toIsoWithOffset(combine(to, ret.time)),
                  })}
                  onPickupTime={(t) => update({ pickupAt: toIsoWithOffset(combine(pickup.date, t)) })}
                  onReturnTime={(t) => update({ returnAt: toIsoWithOffset(combine(ret.date, t)) })}
                />
              </div>
              <Select value={sort} onValueChange={(v) => update({ sort: v as SortKey })}>
                <SelectTrigger className="h-12 min-w-[150px] font-medium focus-visible:outline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="price">Price: low to high</SelectItem>
                  <SelectItem value="rating">Rating</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* The shop's own inventory is small enough that a type chip row
              replaces Browse's whole filter rail — a shop page is a profile,
              not a search surface. */}
          {shop && shop.bodyTypes.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-5">
              <TypeChip
                label="All"
                active={selectedTypes.length === 0}
                onClick={() => update({ bodyType: undefined })}
              />
              {shop.bodyTypes.map((bodyType) => (
                <TypeChip
                  key={bodyType}
                  label={bodyTypeLabel(bodyType)}
                  active={selectedTypes.includes(bodyType)}
                  onClick={() => update({
                    bodyType: selectedTypes.includes(bodyType)
                      ? selectedTypes.filter((type) => type !== bodyType)
                      : [...selectedTypes, bodyType],
                  })}
                />
              ))}
            </div>
          )}

          {loading && (
            <>
              <span role="status" className="sr-only">Loading shop vehicles</span>
              <VehicleSkeletons count={skeletonCount} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5" />
            </>
          )}
          {failed && <SearchFailure onRetry={() => void inventory.refetch({ cancelRefetch: false })} retrying={inventory.isFetching} />}

          {!failed && !loading && data?.results.length === 0 && (
            <EmptyState title="No vehicles available for these dates" description="Try a different pickup and return window at this shop.">
              <button type="button" className={feedbackActionClass} onClick={() => datesRef.current?.openDates()}>Change dates</button>
            </EmptyState>
          )}

          {!failed && !loading && data && data.results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {data.results.map((r) => (
                <VehicleCard key={`${r.model.id}:${r.primaryOffer.shopId}`} result={r} />
              ))}
            </div>
          )}
        </section>

        {shop && <ReviewsSection key={shop.shopId} shopId={shop.shopId} shopName={shop.name} reviewBookingId={reviewBookingId} />}
      </div>

      <Footer />
    </div>
  );
}

function ShopHeader({ shop }: { shop: ShopProfile }) {
  const licence = shop.licences[0];

  const photos = shop.photoUrls ?? [];
  return (
    <>
    {photos.length > 0 && (
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
        {photos.map((url) => (
          <img key={url} src={url} alt="" loading="lazy" className="h-40 w-60 shrink-0 rounded-panel bg-surface-3 object-cover" />
        ))}
      </div>
    )}
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold text-ink">{shop.name}</h1>
          {shop.status !== "OPEN" && (
            <span className="rounded-full bg-surface-3 text-ink-3 text-xs font-medium px-2.5 py-1">
              Temporarily closed
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-sm text-ink-2">
          {/* PRODUCT.md: at launch nearly every shop has zero reviews — that
              is the default state, so it reads as a fact, not an absence. */}
          {shop.reviewCount > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 fill-amber text-amber" />
              <span className="font-medium text-ink">{shop.rating?.toFixed(1)}</span>
              <span className="text-ink-3">
                ({shop.reviewCount} review{shop.reviewCount === 1 ? "" : "s"})
              </span>
            </span>
          ) : (
            <span className="text-ink-3">No reviews yet</span>
          )}
          <span className="text-ink-3">
            On RetroMobi since{" "}
            {new Date(shop.memberSince).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
          </span>
        </div>

        <div className="mt-5 rounded-panel border border-line divide-y divide-line">
          <InfoRow icon={<MapPin className="h-4 w-4" />} label="Address">
            {shop.addressLine1}, {shop.city}, {shop.state} {shop.pincode}
            {shop.landmark && <span className="mt-0.5 block text-ink-3">{shop.landmark}</span>}
          </InfoRow>

          {shop.phone && (
            <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone">
              <a href={`tel:${shop.phone}`} className="hover:underline">
                {shop.phone}
              </a>
            </InfoRow>
          )}

          {shop.ownerName && (
            <InfoRow icon={<ShieldCheck className="h-4 w-4" />} label="Licence holder">
              {shop.ownerName}
            </InfoRow>
          )}

          {/* The product's whole legality claim, stated per shop: which
              authority licensed it and until when. An unlicensed shop has no
              listings to reach this page with, so "none" is worth saying. */}
          <InfoRow icon={<ShieldCheck className="h-4 w-4" />} label="Rent-a-Motorcycle licence">
            {licence ? (
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-ink">{licence.licenceNumber}</span>
                <span className="text-ink-3 text-xs">
                  {licence.issuingAuthority ?? "Issuing authority not recorded"}
                  {licence.expiresAt
                    ? ` · valid to ${new Date(licence.expiresAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}`
                    : ""}
                </span>
              </span>
            ) : (
              <span className="text-ink-3">No active licence on record</span>
            )}
          </InfoRow>

          {shop.hours.length > 0 && (
            <InfoRow icon={<Clock className="h-4 w-4" />} label="Opening hours">
              <span className="flex flex-col gap-0.5">
                {shop.hours.map((h) => (
                  <span key={h.dayOfWeek} className="text-ink-2">
                    <span className="inline-block w-24 text-ink-3">{DAY_NAMES[h.dayOfWeek]}</span>
                    {h.opensAt.slice(0, 5)} – {h.closesAt.slice(0, 5)}
                  </span>
                ))}
              </span>
            </InfoRow>
          )}
        </div>
      </div>

      {shop.latitude != null && shop.longitude != null && (
        <div className="relative w-full lg:self-stretch">
          <ShopLocationMap latitude={shop.latitude} longitude={shop.longitude} label={shop.name} fill />
        </div>
      )}
    </div>
    </>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-3.5 flex gap-3 text-sm">
      <span className="text-ink-4 mt-0.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs text-ink-3 mb-0.5">{label}</span>
        <span className="text-ink-2">{children}</span>
      </span>
    </div>
  );
}

function TypeChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-8 px-3.5 rounded-full border text-sm font-medium transition-colors ${
        active ? "bg-ink text-surface border-ink" : "border-line-strong text-ink hover:bg-surface-3"
      }`}
    >
      {label}
    </button>
  );
}
