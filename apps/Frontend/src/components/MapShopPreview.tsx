import { Link, useSearch } from "wouter";
import { Star, ArrowRight, X } from "lucide-react";
import type { SearchResult } from "../lib/types";
import { rupees } from "../lib/format";

export function MapShopPreview({ results, onClose }: { results: SearchResult[]; onClose: () => void }) {
  const search = useSearch();
  const offer = results[0]?.primaryOffer;
  if (!offer) return null;
  const startingPrice = Math.min(...results.map((result) => result.primaryOffer.pricePerDay));

  return (
    <section role="dialog" aria-label={`Shop details for ${offer.shopName}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      }}
      className="rounded-[10px] overflow-hidden bg-surface text-ink">
      <div className="flex items-start justify-between gap-3 pb-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-snug">{offer.shopName}</h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-3">
            {offer.rating != null && offer.reviewCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-ink-2 tnum">
                <Star className="w-3 h-3 fill-current" /> {offer.rating.toFixed(1)} ({offer.reviewCount})
              </span>
            ) : <span>No reviews yet</span>}
            <span>· {results.length} vehicle {results.length === 1 ? "option" : "options"}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close shop preview"
          className="w-8 h-8 shrink-0 rounded-full text-ink flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="border-t border-line/60" />
      <div className="pt-2 flex items-center justify-between gap-3">
        <div className="text-xs text-ink-3">From <strong className="text-[17px] font-semibold text-ink tnum">{rupees(startingPrice)}</strong> / day</div>
        <Link href={`/shops/${encodeURIComponent(offer.shopId)}${search ? `?${search}` : ""}`}
          className="shop-preview-shop-link shrink-0 inline-flex items-center gap-1.5 rounded-sm py-1 text-[13px] font-medium">View shop <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </section>
  );
}
