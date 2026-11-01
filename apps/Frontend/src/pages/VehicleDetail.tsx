import { Link, useParams } from "wouter";
import { ArrowUpRight, Check } from "lucide-react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { ShopLocationMap } from "../components/ShopLocationMap";
import { ReviewsSection } from "../components/ReviewsSection";
import { ShareButton } from "../components/ShareButton";
import { useVehicleDetail } from "../lib/api";
import { useCart } from "../lib/cart";
import { rupees } from "../lib/format";

export function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: v, isLoading, isError } = useVehicleDetail(id);
  const { qtyFor, setQty, openDrawer } = useCart();
  const inCart = v ? qtyFor(v.modelId, v.shopId) > 0 : false;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="max-w-[1180px] w-full mx-auto px-5 py-8 flex-1">
        <Link href="/browse" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to browse
        </Link>

        {isLoading && <p className="mt-8 text-sm text-ink-3">Loading…</p>}

        {isError && (
          <p className="mt-8 text-sm text-danger bg-danger-soft rounded-panel px-4 py-3">
            Couldn't load this listing. It may have been removed.
          </p>
        )}

        {v && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 items-start">
            <div>
              <div className="relative aspect-[16/10] rounded-panel bg-surface-3 flex flex-col items-center justify-center gap-2 text-ink-4 mb-6 overflow-hidden">
                <VehicleGlyph />
                <span className="text-sm">Photo pending</span>
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
                    {v.licence.validUntil ? `, valid to ${formatDate(v.licence.validUntil)}.` : "."}
                  </p>
                </div>
              ) : (
                <div className="mt-6 rounded-panel bg-warning-soft border border-warning/20 px-5 py-4">
                  <p className="text-warning font-semibold">Licence not yet confirmed</p>
                  <p className="mt-1 text-sm text-ink-2">
                    This vehicle isn't currently named on an active rental licence.
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
                <SectionHeading icon={<ShopIcon />} title="Shop identity" />
                <div className="rounded-panel border border-line divide-y divide-line">
                  <Row label="Name" value={v.shopName} />
                  <Row label="Address" value={v.shopAddress} />
                  {v.shopPhone && <Row label="Phone" value={v.shopPhone} />}
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

              {v.shopLatitude != null && v.shopLongitude != null && (
                <section className="mt-8">
                  <SectionHeading icon={<PinIcon />} title="Pickup location" />
                  <ShopLocationMap latitude={v.shopLatitude} longitude={v.shopLongitude} label={v.shopName} />
                </section>
              )}

              <ReviewsSection shopId={v.shopId} shopName={v.shopName} vehicleId={v.vehicleId} />
            </div>

            <aside className="rounded-panel border border-line p-5 lg:sticky lg:top-24">
              <div className="tnum text-3xl font-bold text-ink">
                {rupees(v.amount)}
                <span className="text-base font-normal text-ink-3"> /day</span>
              </div>

              <div className="mt-4 flex items-start gap-3 rounded-row bg-surface-2 px-4 py-3">
                <ShieldIcon />
                <div>
                  <p className="text-sm font-medium text-ink">Refundable deposit: {rupees(v.securityDeposit)}</p>
                  <p className="mt-1 text-xs text-ink-3">
                    Held by {v.shopName}, not RetroMobi. Returned per the shop's stated condition after
                    the vehicle is checked in.
                  </p>
                </div>
              </div>

              {inCart ? (
                <button
                  type="button"
                  onClick={openDrawer}
                  className="mt-5 w-full h-11 rounded-row bg-verified-soft text-verified font-semibold flex items-center justify-center gap-1.5"
                >
                  <Check className="h-4 w-4" /> In your cart — view cart
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setQty(
                      {
                        modelId: v.modelId,
                        shopId: v.shopId,
                        make: v.make,
                        model: v.model,
                        shopName: v.shopName,
                        pricePerDay: v.amount,
                      },
                      1,
                      [v.vehicleId],
                    );
                    openDrawer();
                  }}
                  className="mt-5 w-full h-11 rounded-row bg-amber text-on-amber font-semibold hover:brightness-95 transition-[filter] flex items-center justify-center"
                >
                  Add to cart
                </button>
              )}
              <p className="mt-2 text-center text-xs text-ink-4">
                Pick dates and riders at checkout — full price breakdown before you pay.
              </p>
            </aside>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

function Row({ label, value, tnum }: { label: string; value: string; tnum?: boolean }) {
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
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
