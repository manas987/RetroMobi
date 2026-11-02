import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Minus, Plus } from "lucide-react";
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

  return (
    <article
      onClick={() => navigate(`/vehicles/${offer.vehicleId}`)}
      className="group flex flex-col cursor-pointer"
    >
      {/* The photo is the card. No panel, no border, no padding box — the only
          edge on the page is the image's own rounding, and the text sits loose
          underneath it. */}
      <div className="relative aspect-[4/3] rounded-[18px] overflow-hidden bg-surface-3">
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

      <div className="pt-3 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          {/* min-w-0 is what lets truncate beat the flex item's content width. */}
          <h3 className="min-w-0 truncate font-semibold text-ink">
            {model.make} {model.model}
          </h3>
          <Rating rating={offer.rating} reviewCount={offer.reviewCount} />
        </div>

        {/* The shop name carries the link rather than a separate "View shop"
            row — same destination, one less line. */}
        <Link
          href={`/shops/${offer.shopId}`}
          onClick={(e) => e.stopPropagation()}
          className="text-sm text-ink-3 truncate hover:text-ink hover:underline underline-offset-2"
        >
          {offer.shopName}
        </Link>

        <p className="text-sm text-ink-3">
          {maxQty} available · {rupees(offer.securityDeposit)} deposit
        </p>

        {/* The price and the action share a row rather than the action taking
            a full-width one of its own — the text column never fills the card,
            so that space was already there. */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink">
            <span className="tnum font-semibold underline underline-offset-2">{rupees(offer.pricePerDay)}</span>
            <span className="text-ink-3"> / day</span>
          </p>

          {/* Nothing in the cart yet is a one-decision moment, so it gets one
              amber button. Once a unit is in, the same strip becomes the
              stepper, and the minus at 1 drops the line and brings the button
              back. */}
          {qty === 0 ? (
            <button
              type="button"
              onClick={(e) => changeQty(e, 1)}
              className="shrink-0 h-9 px-5 rounded-full bg-amber text-on-amber text-sm font-semibold hover:brightness-95 transition-[filter] flex items-center justify-center"
            >
              Add to cart
            </button>
          ) : (
            <div className="shrink-0 h-9 flex items-stretch divide-x divide-line rounded-full border border-line-strong overflow-hidden">
              <button
                type="button"
                onClick={(e) => changeQty(e, qty - 1)}
                aria-label="Decrease quantity"
                className="px-3.5 flex items-center justify-center text-ink hover:bg-surface-3 transition-colors"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-10 flex items-center justify-center text-sm font-semibold tnum">{qty}</span>
              <button
                type="button"
                onClick={(e) => changeQty(e, qty + 1)}
                disabled={qty >= maxQty}
                aria-label="Increase quantity"
                className="px-3.5 flex items-center justify-center text-ink hover:bg-surface-3 disabled:opacity-30 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
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
