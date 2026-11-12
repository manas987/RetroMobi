import { useState, type ReactNode } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { EmptyState, feedbackActionClass, LoadingSkeleton, SkeletonBlock } from "../components/ContentFeedback";
import { SearchFailure } from "../components/SearchFeedback";
import { ShopLocationMap } from "../components/ShopLocationMap";
import { ReviewsSection } from "../components/ReviewsSection";
import { ShareButton } from "../components/ShareButton";
import { DateRangeField } from "../components/DateRangeField";
import { combine, splitIso } from "../components/DateTimeField";
import { ApiError, useVehicleDetail } from "../lib/api";
import { useCart } from "../lib/cart";
import { dateLabel, enumLabel, rupees } from "../lib/format";
import { formatDateSummary } from "../lib/dateRange";
import { defaultWindow, rentalWindowFromSearch, toIsoWithOffset } from "../lib/searchParams";
import { useModelImage } from "../lib/useModelImage";
import { stockPhotos } from "../lib/stockPhoto";
import type { VehicleDetail as Listing } from "../lib/types";

export function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const [datesError, setDatesError] = useState<string | null>(null);
  const rentalWindow = rentalWindowFromSearch(search) ?? defaultWindow();
  const pickup = splitIso(rentalWindow.pickupAt);
  const ret = splitIso(rentalWindow.returnAt);
  const query = useVehicleDetail(id, rentalWindow);
  const { data: v, isLoading, error } = query;
  const invalidLink = error instanceof ApiError && error.status === 400;
  const unavailable = invalidLink || (error instanceof ApiError && error.status === 404);
  const { items, setQty, openDrawer } = useCart();
  const cartLine = v && items.find((item) => item.modelId === v.modelId && item.shopId === v.shopId);
  const inCart = !!(v && cartLine && cartLine.vehicleIds.includes(v.vehicleId));
  const canAdd = !!(v?.listingEligible && v.datesAvailable && v.quote && !query.isPlaceholderData && !error);
  const params = new URLSearchParams(search);
  const shopId = params.get("shopId");
  const backPath = shopId && !params.get("city") ? `/shops/${encodeURIComponent(shopId)}` : "/browse";
  const backHref = `${backPath}${search ? `?${search}` : ""}`;
  const backLabel = backPath === "/browse" ? "Back to browse" : "Back to shop";
  const pickupPin = v?.shopLatitude != null && v?.shopLongitude != null
    ? { latitude: v.shopLatitude, longitude: v.shopLongitude }
    : null;
  const pickupDestination = pickupPin ? `${pickupPin.latitude},${pickupPin.longitude}` : v?.shopAddress;

  function changeDates(from: Date, to: Date) {
    const next = new URLSearchParams(search);
    next.set("pickupAt", toIsoWithOffset(from));
    next.set("returnAt", toIsoWithOffset(to));
    if (!rentalWindowFromSearch(next.toString())) {
      setDatesError("Choose a return time after pickup and a window of up to 365 days.");
      return;
    }
    setDatesError(null);
    navigate(`/vehicles/${id}?${next}`, { replace: true });
  }

  function addOrOpenCart() {
    if (v?.quote && canAdd) {
      const selected = [...new Set([...(cartLine?.vehicleIds ?? []), v.vehicleId])];
      const available = [...new Set([...selected, ...(cartLine?.availableVehicleIds ?? [])])];
      const outcome = setQty({
        modelId: v.modelId, shopId: v.shopId, make: v.make, model: v.model, shopName: v.shopName,
        pricePerDay: v.quote.pricePerDay,
        ...rentalWindow,
      }, selected.length, available);
      if (outcome === "full") return;
    }
    openDrawer();
  }

  return (
    <div className={`min-h-screen flex flex-col ${v && !unavailable ? "pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0" : ""}`}>
      <Header />

      <div className="max-w-[1180px] w-full mx-auto px-5 py-8 flex-1">
        {!unavailable && <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {backLabel}
        </Link>}

        {isLoading && (
          <LoadingSkeleton label="Loading vehicle details" className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 items-start">
            <div className="space-y-4">
              <SkeletonBlock className="aspect-[16/10] rounded-panel" />
              <SkeletonBlock className="h-8 w-2/5" />
              <SkeletonBlock className="h-4 w-3/5" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[0, 1, 2, 3].map((index) => <SkeletonBlock key={index} className="h-14 rounded-panel" />)}
              </div>
            </div>
            <div className="space-y-4 rounded-panel border border-line p-5">
              <SkeletonBlock className="h-8 w-1/3" />
              <SkeletonBlock className="h-16 rounded-row" />
              <SkeletonBlock className="h-11 rounded-row" />
            </div>
          </LoadingSkeleton>
        )}

        {unavailable && (
          <EmptyState title="Listing unavailable" description={invalidLink ? "This listing link is invalid. Browse for another ride." : "This vehicle is no longer listed. Browse for another ride."} className="mt-6">
            <Link href={backHref} className={feedbackActionClass}>{backLabel}</Link>
          </EmptyState>
        )}
        {!v && error && !unavailable && (
          <div className="mt-6">
            <SearchFailure title="We couldn’t load this listing" onRetry={() => void query.refetch({ cancelRefetch: false })} retrying={query.isFetching} />
          </div>
        )}

        {v && !unavailable && (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-x-10 lg:gap-y-0">
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              <div className="relative aspect-[16/10] rounded-panel bg-surface-3 flex flex-col items-center justify-center gap-2 text-ink-4 mb-6 overflow-hidden">
                <ListingPhoto key={v.vehicleId} listing={v} />
                {v.licence && (
                  <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-verified-soft text-verified text-xs font-medium px-2.5 py-1">
                    <CheckIcon /> Licensed to rent
                  </span>
                )}
                {v.fuelType === "ELECTRIC" && (
                  <span className="absolute right-4 top-4 rounded-full bg-surface/90 text-ink text-xs font-medium px-2.5 py-1">
                    EV
                  </span>
                )}
                <div className="absolute right-4 bottom-4">
                  <ShareButton title={`${v.make} ${v.model} — RetroMobi`} text={`${v.make} ${v.model} at ${v.shopName}`} />
                </div>
              </div>

              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="text-2xl font-semibold text-ink leading-tight">
                    {v.make} {v.model}
                  </h1>
                  <p className="mt-1.5 text-ink-2 flex items-center gap-1.5">
                    <PinIcon />{" "}
                    <Link href={`/shops/${v.shopId}`} className="hover:underline">
                      {v.shopName}
                    </Link>{" "}
                    · {v.shopAddress}
                  </p>
                </div>
                <RatingBadge rating={v.rating} reviewCount={v.reviewCount} />
              </div>
            </div>

            <aside className="self-start rounded-panel border border-line p-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
              {query.isPlaceholderData ? (
                <LoadingSkeleton label="Checking availability and price" className="space-y-2">
                  <SkeletonBlock className="h-9 w-32" />
                  <SkeletonBlock className="h-4 w-48" />
                </LoadingSkeleton>
              ) : (
                <>
                  <div className="hidden tnum text-3xl font-bold text-ink lg:block">
                    {rupees(v.quote?.pricePerDay ?? v.amount)}
                    <span className="text-base font-normal text-ink-3">{v.quote ? " / first day" : " / weekday"}</span>
                  </div>
                  {v.quote && <p className="mt-1 text-sm text-ink-2">{rupees(v.quote.rentalAmount)} rental subtotal · {formatDateSummary(pickup.date, ret.date)}</p>}
                </>
              )}
              <div className="mt-4 flex rounded-row border border-line px-2.5 py-2 text-xs max-[360px]:[&_span.truncate]:whitespace-normal sm:px-3 sm:text-base">
                <DateRangeField pickupDate={pickup.date} pickupTime={pickup.time} returnDate={ret.date} returnTime={ret.time}
                  onDatesChange={(from, to) => changeDates(combine(from, pickup.time), combine(to, ret.time))}
                  onPickupTime={(time) => changeDates(combine(pickup.date, time), combine(ret.date, ret.time))}
                  onReturnTime={(time) => changeDates(combine(pickup.date, pickup.time), combine(ret.date, time))}
                />
              </div>
              {datesError && <p role="alert" className="mt-2 text-sm text-danger">{datesError}</p>}

              <div className="mt-4 flex items-start gap-3 rounded-row bg-surface-2 px-4 py-3">
                <ShieldIcon />
                <div>
                  <p className="text-sm font-medium text-ink">{rupees(v.securityDeposit)} refundable security deposit</p>
                  <p className="mt-1 text-xs text-ink-3">Your deposit is returned in full when you return the scooter on time and undamaged.</p>
                </div>
              </div>

              {error && v && <div className="mt-4"><SearchFailure title="We couldn’t check these dates" onRetry={() => void query.refetch({ cancelRefetch: false })} retrying={query.isFetching} /></div>}
              {!query.isPlaceholderData && !error && !canAdd && (
                <p className="mt-4 text-sm text-ink-2">
                  {v.listingEligible ? "Try a different rental window." : "This vehicle can’t be booked for the selected dates."}
                </p>
              )}
              <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t border-line bg-surface px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:static lg:mt-5 lg:block lg:border-0 lg:p-0">
                {canAdd && v.quote && (
                  <div className="min-w-0 lg:hidden">
                    <p className="text-lg font-semibold leading-tight text-ink tnum">{rupees(v.quote.rentalAmount)}</p>
                    <p className="text-xs text-ink-2">Rental subtotal</p>
                    {v.securityDeposit > 0 && <p className="text-xs text-ink-3">+ {rupees(v.securityDeposit)} refundable deposit</p>}
                  </div>
                )}
                <button
                  type="button"
                  onClick={addOrOpenCart}
                  disabled={!canAdd}
                  className={`min-h-11 shrink-0 flex-1 rounded-row px-3 text-sm font-semibold flex items-center justify-center gap-1.5 lg:w-full ${
                    !canAdd ? "bg-surface-3 text-ink-2" : inCart ? "bg-verified-soft text-verified" : "bg-amber text-on-amber hover:brightness-95"
                  }`}
                >
                  {query.isPlaceholderData ? "Checking dates…" : !canAdd ? "Not available" : inCart ? <><Check className="h-4 w-4" /> View cart</> : "Add to cart"}
                </button>
              </div>
              {canAdd && <p className="mt-2 hidden text-center text-xs text-ink-3 lg:block">Assign riders at checkout and see the full price before paying.</p>}
            </aside>

            <div className="min-w-0 lg:col-start-1 lg:row-start-2">
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SpecChip icon={<FuelIcon />} label="Fuel" value={v.fuelType ?? "—"} />
                <SpecChip icon={<EngineIcon />} label="Engine" value={v.engineCc != null ? `${v.engineCc} cc` : "—"} />
                <SpecChip icon={<BodyIcon />} label="Body type" value={v.bodyType ?? "—"} />
                <SpecChip icon={<SeatIcon />} label="Seating" value={v.seatingCapacity != null ? `${v.seatingCapacity}` : "—"} />
              </div>

              {v.licence ? (
                <div className="mt-6 rounded-panel bg-verified-soft border border-verified/20 px-5 py-4">
                  <p className="text-verified font-semibold flex items-center gap-1.5">
                    <CheckIcon /> Licensed to rent
                  </p>
                  <p className="mt-1 text-sm text-ink-2">
                    Named on {v.shopName}'s Rent-a-Motorcycle licence {v.licence.licenceNumber}
                    {v.licence.issuingAuthority ? ` (${v.licence.issuingAuthority})` : ""}
                    {v.licence.validUntil ? `, valid to ${dateLabel(v.licence.validUntil)}.` : "."}
                  </p>
                </div>
              ) : (
                <div className="mt-6 rounded-panel bg-warning-soft border border-warning/20 px-5 py-4">
                  <p className="text-warning font-semibold">Licence not yet confirmed</p>
                  <p className="mt-1 text-sm text-ink-2">
                    This vehicle has no confirmed rental licence covering these dates.
                  </p>
                </div>
              )}

              <section className="mt-8">
                <SectionHeading icon={<TagIcon />} title="Pricing" />
                <div className="rounded-panel border border-line divide-y divide-line">
                  <Row label="Weekday rate" value={`${rupees(v.amount)} / day`} tnum />
                  <Row label="Weekend rate" value={`${rupees(v.weekendAmount)} / day`} tnum />
                  <Row label="Refundable deposit" value={rupees(v.securityDeposit)} tnum />
                  {v.lateFeeAmount > 0 && <Row label="Late return" value={`${rupees(v.lateFeeAmount)} / hour`} tnum />}
                </div>
              </section>

              <section className="mt-8">
                <SectionHeading icon={<ClipboardList size={16} />} title="Rental terms" />
                <div className="rounded-panel border border-line divide-y divide-line">
                  <Row label="Bring to pickup" value="Your original driving licence" />
                  {!!v.accessories?.length && (
                    <Row label="Accessories" value={v.accessories.map(({ type, quantity }) => `${quantity} × ${enumLabel(type)}`).join(", ")} />
                  )}
                  <details className="px-5 py-3 text-sm text-ink">
                    <summary className="cursor-pointer font-medium">Cancellation policy</summary>
                    <ul className="mt-2 space-y-1 text-ink-2">
                      <li>More than 24 hours before pickup · 90% of the rental refunded</li>
                      <li>2–24 hours before pickup · 50% of the rental refunded</li>
                      <li>Under 2 hours until pickup · No rental refund</li>
                    </ul>
                    <p className="mt-2 text-ink-2">Eligible cancellations include a full deposit refund. Rental refunds are based on the scheduled pickup time and exclude platform fees and taxes.</p>
                  </details>
                </div>
              </section>

              <section className="mt-8">
                <SectionHeading icon={<ShopIcon />} title="Shop identity" />
                <div className="rounded-panel border border-line divide-y divide-line">
                  <Row label="Name" value={v.shopName} />
                  <Row label="Address" value={v.shopAddress} />
                  {v.shopPhone && <Row label="Phone" value={<a href={`tel:${v.shopPhone}`} className="underline underline-offset-2">{v.shopPhone}</a>} />}
                </div>
                <div className="mt-3 flex justify-end">
                  <Link
                    href={`/shops/${v.shopId}`}
                    className="text-xs text-ink-4 underline underline-offset-2 hover:text-ink inline-flex items-center gap-0.5"
                  >
                    View shop
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              </section>

              {pickupDestination && (
                <section className="mt-8">
                  <div className="flex flex-wrap justify-between gap-x-3">
                    <SectionHeading icon={<PinIcon />} title="Pickup location" />
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pickupDestination)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 underline underline-offset-2 hover:text-ink"
                    >
                      Get directions <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  {pickupPin ? <ShopLocationMap {...pickupPin} label={v.shopName} /> : (
                    <p className="text-sm text-ink-2">{v.shopAddress}</p>
                  )}
                </section>
              )}

              <ReviewsSection shopId={v.shopId} shopName={v.shopName} />
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

function Row({ label, value, tnum }: { label: string; value: ReactNode; tnum?: boolean }) {
  return (
    <div className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
      <span className="text-ink-3">{label}</span>
      <span className={`text-ink font-medium text-right ${tnum ? "tnum" : ""}`}>{value}</span>
    </div>
  );
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-2 font-semibold text-ink mb-3">
      <span className="text-ink-3">{icon}</span>
      {title}
    </h2>
  );
}

function SpecChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-panel border border-line px-3.5 py-3 flex flex-col gap-1.5">
      <span className="text-ink-3">{icon}</span>
      <div>
        <p className="text-[11px] text-ink-3 leading-none">{label}</p>
        <p className="text-sm font-medium text-ink mt-1">{value}</p>
      </div>
    </div>
  );
}

function RatingBadge({ rating, reviewCount }: { rating: number | null; reviewCount: number }) {
  if (rating == null || reviewCount === 0) {
    return <span className="shrink-0 text-sm text-ink-4 whitespace-nowrap">No reviews yet</span>;
  }
  return (
    <span className="shrink-0 inline-flex items-center gap-1 text-sm text-ink-2 whitespace-nowrap tnum">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="text-amber-edge" aria-hidden="true">
        <path d="M12 2.5l2.9 6.4 6.9.7-5.2 4.8 1.5 6.9L12 17.9 5.9 21.3l1.5-6.9-5.2-4.8 6.9-.7z" />
      </svg>
      {rating.toFixed(1)}
      <span className="text-ink-4">({reviewCount})</span>
    </span>
  );
}

function ListingPhoto({ listing }: { listing: Listing }) {
  const uploaded = useModelImage(listing.modelId, !!listing.imageKey);
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const published = (listing.photoUrls ?? []).filter((url) => !failed.includes(url));
  const representative = published.length === 0;
  const photos = representative
    ? [...new Set([uploaded, ...stockPhotos(listing.make, listing.model)])].filter((url): url is string => !!url && !failed.includes(url))
    : published;
  const index = Math.min(selected, Math.max(0, photos.length - 1));
  const src = photos[index];
  if (!src) return <><VehicleGlyph /><span className="text-sm">Photo pending</span></>;
  const photoButton = "absolute top-1/2 -translate-y-1/2 grid size-10 place-items-center rounded-full bg-surface text-ink shadow-sm";
  return (
    <>
      <img key={src} src={src} alt={`${listing.make} ${listing.model}`} className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed((urls) => [...urls, src])} />
      {(representative || photos.length > 1) && (
        <span role="status" className="absolute bottom-4 left-4 rounded-full bg-surface px-2.5 py-1 text-xs text-ink-2">
          {representative && "Representative photo"}
          {representative && photos.length > 1 && " · "}
          {photos.length > 1 && `${index + 1} / ${photos.length}`}
        </span>
      )}
      {photos.length > 1 && (
        <>
          <button type="button" aria-label="Previous photo" className={`${photoButton} left-3`} onClick={() => setSelected((index + photos.length - 1) % photos.length)}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" aria-label="Next photo" className={`${photoButton} right-3`} onClick={() => setSelected((index + 1) % photos.length)}>
            <ChevronRight size={18} />
          </button>
        </>
      )}
    </>
  );
}

function VehicleGlyph() {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6" cy="17" r="3.2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="18" cy="17" r="3.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 17 9 9h4l4 5h2M9 9 7.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12.5l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="inline shrink-0">
      <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function FuelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 20V6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v14M6 20h9M14 10h1.5a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 0 3 0v-5l-2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EngineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="9" width="12" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15 11h3l3 2.5V16h-6M6 9V6h4v3M9 16v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BodyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6" cy="17" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18" cy="17" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 17h12M10 17 13 7h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SeatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 20v-3a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v3M15 10h3l2 4v6h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20.6 12.3 12.3 20.6a1.5 1.5 0 0 1-2.1 0l-6.8-6.8a1.5 1.5 0 0 1 0-2.1L11.7 3.4A2 2 0 0 1 13.1 3H20a1 1 0 0 1 1 1v6.9a2 2 0 0 1-.4 1.4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="16" cy="8" r="1.3" fill="currentColor" />
    </svg>
  );
}

function ShopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10v10h16V10M2 10l2-6h16l2 6M2 10a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 mt-0.5 text-ink-3">
      <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
