import { Link } from "wouter";
import { rupees } from "../lib/format";
import type { SearchResult } from "../lib/types";

export function VehicleCard({ result }: { result: SearchResult }) {
  const { model, primaryOffer: offer } = result;

  return (
    <article className="group bg-surface rounded-panel border border-line overflow-hidden flex flex-col hover:border-line-strong transition-colors">
      <div className="relative aspect-[4/3] bg-surface-3">
        <VehiclePhoto />
        {offer.licence && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-verified-soft text-verified text-xs font-medium px-2.5 py-1">
            <CheckIcon /> Licensed to rent
          </span>
        )}
        {model.fuelType === "ELECTRIC" && (
          <span className="absolute right-3 top-3 rounded-full bg-surface/90 text-ink text-xs font-medium px-2.5 py-1">
            EV
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-ink leading-snug">
            {model.make} {model.model}
          </h3>
          <Rating rating={offer.rating} reviewCount={offer.reviewCount} />
        </div>

        <p className="text-sm text-ink-3">
          {[model.bodyType, model.seatingCapacity ? `${model.seatingCapacity} seats` : null, offer.distanceKm != null ? `${offer.distanceKm.toFixed(1)} km away` : null]
            .filter(Boolean)
            .join(" · ") || offer.shopName}
        </p>

        <div className="mt-auto pt-3 border-t border-line flex items-end justify-between gap-3">
          <div>
            <div className="tnum text-lg font-semibold text-ink">{rupees(offer.pricePerDay)}</div>
            <div className="text-xs text-ink-3">
              + {rupees(offer.securityDeposit)} refundable deposit
            </div>
            <div className="text-xs text-ink-4 mt-0.5">{offer.shopName}</div>
          </div>
          <Link
            href={`/vehicles/${offer.vehicleId}`}
            className="shrink-0 h-9 px-4 rounded-full bg-ink text-surface text-sm font-medium flex items-center hover:bg-ink-2 transition-colors"
          >
            View ride
          </Link>
        </div>
      </div>
    </article>
  );
}

function Rating({ rating, reviewCount }: { rating: number | null; reviewCount: number }) {
  // ponytail: PRODUCT.md — most shops launch with zero reviews; that is the
  // default state to design for, never hidden behind a fabricated number.
  if (rating == null || reviewCount === 0) {
    return <span className="shrink-0 text-xs text-ink-4 whitespace-nowrap">No reviews yet</span>;
  }
  return (
    <span className="shrink-0 inline-flex items-center gap-1 text-sm text-ink-2 whitespace-nowrap tnum">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-amber-edge" aria-hidden="true">
        <path d="M12 2.5l2.9 6.4 6.9.7-5.2 4.8 1.5 6.9L12 17.9 5.9 21.3l1.5-6.9-5.2-4.8 6.9-.7z" />
      </svg>
      {rating.toFixed(1)}
      <span className="text-ink-4">({reviewCount})</span>
    </span>
  );
}

function VehiclePhoto() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-ink-4">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="6" cy="17" r="3.2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="18" cy="17" r="3.2" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M6 17 9 9h4l4 5h2M9 9 7.5 6.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[11px]">Photo pending</span>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12.5l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
