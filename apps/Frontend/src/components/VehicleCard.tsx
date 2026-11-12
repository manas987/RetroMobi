import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { rupees } from "../lib/format";
import { useCart } from "../lib/cart";
import { useModelImage } from "../lib/useModelImage";
import { stockPhotos } from "../lib/stockPhoto";
import { defaultWindow, rentalWindowFromSearch } from "../lib/searchParams";
import type { SearchResult } from "../lib/types";

export function VehicleCard({ result, highlighted = false }: { result: SearchResult; highlighted?: boolean }) {
  const { model, primaryOffer: offer, offerVehicleIds } = result;
  const { items, setQty, openDrawer } = useCart();
  const selected = items.find((item) => item.modelId === model.id && item.shopId === offer.shopId)?.vehicleIds ?? [];
  const qty = selected.length;
  const maxQty = offerVehicleIds.length;
  const [, navigate] = useLocation();
  const search = useSearch();
  const rentalWindow = rentalWindowFromSearch(search) ?? defaultWindow();
  const params = new URLSearchParams(search);
  params.set("pickupAt", rentalWindow.pickupAt);
  params.set("returnAt", rentalWindow.returnAt);
  const detailHref = `/vehicles/${offer.vehicleId}?${params}`;

  const line = {
    modelId: model.id,
    shopId: offer.shopId,
    make: model.make,
    model: model.model,
    shopName: offer.shopName,
    pricePerDay: offer.pricePerDay,
    ...rentalWindow,
  };

  function changeQty(e: React.MouseEvent, next: number) {
    e.stopPropagation();
    const outcome = setQty(line, next, [...new Set([...selected, ...offerVehicleIds])]);
    if (outcome === "ok" && next > qty) openDrawer();
  }

  return (
    <article
      onClick={() => navigate(detailHref)}
      tabIndex={0}
      aria-label={`${model.make} ${model.model} at ${offer.shopName}`}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          navigate(detailHref);
        }
      }}
      className="group flex flex-col cursor-pointer rounded-[18px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
    >
      {/* The photo is the card. No panel, no border, no padding box — the only
          edge on the page is the image's own rounding, and the text sits loose
          underneath it. */}
      <div className={`relative aspect-[4/3] rounded-[18px] overflow-hidden bg-surface-3 transition-shadow ${highlighted ? "ring-2 ring-amber ring-offset-4 ring-offset-surface" : ""}`}>
        <VehiclePhoto
          modelId={model.id}
          hasImageKey={Boolean(model.imageKey)}
          make={model.make}
          model={model.model}
        />
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
            so that space was already there.

            -mt-2 cancels exactly that: the 36px button makes this row taller
            than its 20px of text, and centring splits the difference into 8px
            above the price. Without it this line sits further from the one
            above than any other pair.

            The control is nudged with a transform, not a margin, so it rides
            10px higher without the row — and so the card — changing height. */}
        <div className="-mt-2 flex items-center justify-between gap-3">
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
              className="shrink-0 -translate-y-[10px] h-9 px-5 rounded-full glass-yellow text-on-amber text-sm font-semibold transition-[scale] duration-200 flex items-center justify-center"
            >
              Add to cart
            </button>
          ) : (
            <div className="shrink-0 -translate-y-[10px] h-9 flex items-stretch divide-x divide-line rounded-full border border-line-strong overflow-hidden">
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

function VehiclePhoto({
  modelId,
  hasImageKey,
  make,
  model,
}: {
  modelId: string;
  hasImageKey: boolean;
  make: string;
  model: string;
}) {
  // An uploaded photo is the real one and wins. The bundled stock shots are the
  // floor under it — including when the upload resolves to a URL that 404s,
  // which is what the dev-fallback storage hands back.
  const uploaded = useModelImage(modelId, hasImageKey);
  const [failed, setFailed] = useState(false);
  const photos = (failed ? null : uploaded) ? [uploaded!] : stockPhotos(make, model);

  const [i, setI] = useState(0);
  // A filter can swap which model this card shows without remounting it, so a
  // stale index would page to a slide that no longer exists.
  const index = Math.min(i, Math.max(0, photos.length - 1));

  if (photos.length === 0) return <PhotoPending />;

  function step(e: React.MouseEvent, by: number) {
    e.stopPropagation(); // the whole card is a link to the vehicle
    e.preventDefault();
    setI((n) => (n + by + photos.length) % photos.length);
  }

  return (
    <>
      {/* All of them mounted and cross-faded rather than one swapped `src`:
          paging to a slide the browser has not decoded yet flashes the empty
          box, and four ~80KB images is cheaper than that looks. */}
      {photos.map((src, n) => (
        <img
          key={src + n}
          src={src}
          alt=""
          loading={n === 0 ? undefined : "lazy"}
          onError={() => setFailed(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
            n === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {photos.length > 1 && (
        <>
          <Arrow side="left" onClick={(e) => step(e, -1)} />
          <Arrow side="right" onClick={(e) => step(e, 1)} />

          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5 pointer-events-none">
            {photos.map((_, n) => (
              <span
                key={n}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  n === index ? "bg-surface" : "bg-surface/55"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* Hidden until the card is hovered, as in the reference — on a touch screen
   there is no hover, so they stay visible there via the media query. */
function Arrow({ side, onClick }: { side: "left" | "right"; onClick: (e: React.MouseEvent) => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={`absolute top-1/2 -translate-y-1/2 ${
        side === "left" ? "left-2" : "right-2"
      } w-7 h-7 rounded-full bg-surface/90 text-ink flex items-center justify-center shadow-[0_1px_4px_rgba(18,22,26,0.3)] transition-opacity hover:bg-surface opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function PhotoPending() {
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
