import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, ArrowUpRight, Minus, Plus } from "lucide-react";
import { rupees } from "../lib/format";
import { useCart } from "../lib/cart";
import { useModelImage } from "../lib/useModelImage";
import type { SearchResult } from "../lib/types";

export function VehicleCard({ result }: { result: SearchResult }) {
  const { model, primaryOffer: offer, offerVehicleIds } = result;
  const { qtyFor, setQty, openDrawer } = useCart();
  const qty = qtyFor(model.id, offer.shopId);
  const maxQty = offerVehicleIds.length;
  const [, navigate] = useLocation();

  const line = {
    modelId: model.id,
    shopId: offer.shopId,
    make: model.make,
    model: model.model,
    shopName: offer.shopName,
    pricePerDay: offer.pricePerDay,
  };

  function changeQty(e: React.MouseEvent, next: number) {
    e.stopPropagation();
    const outcome = setQty(line, next, offerVehicleIds);
    if (outcome === "ok" && next > qty) openDrawer();
  }

  // shopAddress is always "{line1}, {city}" (see searchService.ts) — the city
  // alone reads better here than the full street address.
  const shopCity = offer.shopAddress.split(",").pop()?.trim();

  return (
    <article
      onClick={() => navigate(`/vehicles/${offer.vehicleId}`)}
      className="group bg-surface rounded-panel border border-line overflow-hidden flex flex-col hover:border-line-strong transition-colors cursor-pointer"
    >
      <div className="relative aspect-[4/3] bg-surface-3">
        <VehiclePhoto modelId={model.id} hasImageKey={Boolean(model.imageKey)} />
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

        <div className="mt-auto pt-3 border-t border-line flex items-stretch justify-between gap-3">
          <div className="min-w-0 flex flex-col justify-between">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="tnum text-2xl font-semibold text-ink">{rupees(offer.pricePerDay)}</span>
                <span className="text-sm text-ink-3">/ day</span>
              </div>
              <div className="text-xs text-ink-3 mt-0.5">{rupees(offer.securityDeposit)} refundable deposit</div>
            </div>
            <div>
              <div className="text-sm text-ink truncate">
                <span className="font-medium">{offer.shopName}</span>
                {shopCity && <span className="text-ink-4"> · {shopCity}</span>}
              </div>
              <Link
                href={`/shops/${offer.shopId}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-ink-4 underline underline-offset-2 hover:text-ink inline-flex items-center gap-0.5"
              >
                View shop
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-end justify-between gap-2">
            <span className="text-xs text-ink-4 inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full bg-verified" />
              {maxQty} available
            </span>
            <div className="h-9 flex items-stretch divide-x divide-line rounded-full border border-line-strong overflow-hidden">
              <button
                type="button"
                onClick={(e) => changeQty(e, qty - 1)}
                disabled={qty === 0}
                aria-label="Decrease quantity"
                className="px-3 flex items-center justify-center text-ink hover:bg-surface-3 disabled:opacity-30 transition-colors"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-10 flex items-center justify-center text-sm font-semibold tnum">{qty}</span>
              <button
                type="button"
                onClick={(e) => changeQty(e, qty + 1)}
                disabled={qty >= maxQty}
                aria-label="Increase quantity"
                className="px-3 flex items-center justify-center text-ink hover:bg-surface-3 disabled:opacity-30 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <Link
              href={`/vehicles/${offer.vehicleId}`}
              onClick={(e) => e.stopPropagation()}
              className="h-9 px-5 rounded-full bg-ink text-surface text-sm font-medium flex items-center gap-1.5 hover:bg-ink-2 transition-colors"
            >
              View ride
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function Rating({ rating, reviewCount }: { rating: number | null; reviewCount: number }) {
  // ponytail: PRODUCT.md — most shops launch with zero reviews; that is the
  // default state to design for, never hidden behind a fabricated number.
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

function VehiclePhoto({ modelId, hasImageKey }: { modelId: string; hasImageKey: boolean }) {
  const url = useModelImage(modelId, hasImageKey);
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setFailed(true)} />;
  }

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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12.5l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
