import { Link, useSearch } from "wouter";
import { Star, X } from "lucide-react";
import type { SearchResult } from "../lib/types";
import { rupees } from "../lib/format";

export function MapShopPreview({ results, onClose }: { results: SearchResult[]; onClose: () => void }) {
  const search = useSearch();
  const vehicles = [...results].sort((a, b) => a.primaryOffer.pricePerDay - b.primaryOffer.pricePerDay);
  const offer = vehicles[0]?.primaryOffer;
  if (!offer) return null;

  return (
    <section role="dialog" aria-label={`Vehicles at ${offer.shopName}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      }}
      className="rounded-[10px] overflow-hidden bg-surface text-ink">
      <div className="flex items-start justify-between gap-3 px-3 pt-3 pb-3 border-b border-line">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-snug">{offer.shopName}</h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-3">
            {offer.rating != null && offer.reviewCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-ink-2 tnum">
                <Star className="w-3 h-3 fill-current" /> {offer.rating.toFixed(1)} ({offer.reviewCount})
              </span>
            ) : <span>No reviews yet</span>}
            <span>· {vehicles.length} vehicle {vehicles.length === 1 ? "option" : "options"}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close shop preview"
          className="w-8 h-8 shrink-0 rounded-full text-ink flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>
      </div>
      <ul aria-label="Available vehicles" className="max-h-[260px] overflow-y-auto divide-y divide-line px-3">
        {vehicles.map(({ model, primaryOffer, offerVehicleIds }) => (
          <li key={`${model.id}:${primaryOffer.shopId}`} className="py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/vehicles/${encodeURIComponent(primaryOffer.vehicleId)}`} className="text-sm font-medium text-ink hover:underline">
                {model.make} {model.model}
              </Link>
              <div className="mt-0.5 text-xs text-ink-3">{offerVehicleIds.length} available</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm"><strong className="tnum">{rupees(primaryOffer.pricePerDay)}</strong><span className="text-xs text-ink-3"> / day</span></div>
              <Link href={`/vehicles/${encodeURIComponent(primaryOffer.vehicleId)}`} className="mt-1 block text-xs text-ink-2 underline underline-offset-2"
                aria-label={`View ${model.make} ${model.model}`}>View vehicle</Link>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-line px-3 py-3">
        <Link href={`/shops/${encodeURIComponent(offer.shopId)}${search ? `?${search}` : ""}`}
          className="block text-center text-sm font-semibold text-ink underline underline-offset-2">View shop</Link>
      </div>
    </section>
  );
}
