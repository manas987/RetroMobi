import { Close as PopoverClose } from "@radix-ui/react-popover";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { MAX_CART_ITEMS, useCart } from "../lib/cart";
import { rupees } from "../lib/format";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";

export function CartDrawer({ children }: { children: ReactNode }) {
  const { items, totalUnits, setQty, drawerOpen, openDrawer, closeDrawer, limitNoticeId, dismissLimit } = useCart();
  const [, navigate] = useLocation();

  const subtotal = items.reduce((sum, i) => sum + i.pricePerDay * i.vehicleIds.length, 0);

  return (
    <>
    <Popover open={drawerOpen} onOpenChange={(open) => open ? openDrawer() : closeDrawer()}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        align="end"
        sideOffset={12}
        aria-label="Your cart"
        className="w-[min(28rem,calc(100vw-1.5rem))] max-h-[min(32rem,var(--radix-popover-content-available-height))] flex flex-col overflow-hidden"
      >
          <div className="flex items-center justify-between px-5 h-14 border-b border-line shrink-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              Your cart
              {totalUnits > 0 && (
                <span className="min-w-6 h-6 px-1.5 rounded-full bg-surface-3 text-xs font-medium text-ink-2 flex items-center justify-center tnum">
                  {totalUnits}
                </span>
              )}
            </h2>
            <PopoverClose aria-label="Close cart" className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-3 transition-colors text-ink-2">
              <X className="h-4 w-4" />
            </PopoverClose>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            {items.length === 0 ? (
              <p className="text-sm text-ink-3 py-10 text-center">
                Nothing in your cart yet. Add a scooter from Browse to start a booking.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {items.map((item) => (
                  <div
                    key={`${item.modelId}:${item.shopId}`}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <Link
                      href={`/vehicles/${item.vehicleIds[0]}`}
                      onClick={closeDrawer}
                      className="min-w-0 flex-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      <p className="text-sm font-medium text-ink truncate">
                        {item.make} {item.model}
                      </p>
                      <p className="text-xs text-ink-3 truncate" title={item.shopName}>{item.shopName}</p>
                      <p className="text-[13px] text-ink mt-0.5 tnum">
                        <span className="font-medium">{rupees(item.pricePerDay)}</span>
                        <span className="text-xs text-ink-3"> / day</span>
                      </p>
                    </Link>
                    <div className="shrink-0 flex items-center gap-1">
                      <div className="h-8 flex items-center rounded-full border border-line px-0.5">
                        <button
                          type="button"
                          onClick={() => setQty(item, item.vehicleIds.length - 1, item.availableVehicleIds)}
                          aria-label={`Remove one ${item.make} ${item.model}`}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-ink focus-visible:outline-2 focus-visible:outline-ink"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-4 text-center text-sm font-medium tnum">{item.vehicleIds.length}</span>
                        <button
                          type="button"
                          onClick={() => setQty(item, item.vehicleIds.length + 1, item.availableVehicleIds)}
                          disabled={item.vehicleIds.length >= item.availableVehicleIds.length}
                          aria-label={`Add one more ${item.make} ${item.model}`}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-ink disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-ink"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setQty(item, 0, item.availableVehicleIds)}
                        aria-label={`Remove ${item.make} ${item.model} from cart`}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:text-danger transition-colors focus-visible:outline-2 focus-visible:outline-ink"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="shrink-0 border-t border-line px-5 py-3">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-[13px] font-medium text-ink-2">Daily subtotal</p>
                  <p className="text-[11px] text-ink-3">Before fees</p>
                </div>
                <span className="text-lg font-semibold text-ink tnum">{rupees(subtotal)}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  closeDrawer();
                  navigate("/checkout");
                }}
                className="w-full h-11 rounded-row glass-yellow text-on-amber text-sm font-semibold transition-[scale] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                Checkout
              </button>
            </div>
          )}
      </PopoverContent>
    </Popover>
    {limitNoticeId > 0 && typeof document !== "undefined" && createPortal(
      <CartLimitNotice key={limitNoticeId} onOpen={openDrawer} onDismiss={dismissLimit} />, document.body,
    )}
    </>
  );
}

export function CartLimitNotice({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3200);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="cart-limit-toast fixed bottom-5 left-1/2 -translate-x-1/2 z-[1200] w-max max-w-[calc(100vw-2rem)] rounded-full border border-line bg-surface/95 px-4 py-2.5 shadow-sm backdrop-blur-sm flex items-center gap-3 text-ink">
      <span role="status" className="text-[13px]">Cart full · {MAX_CART_ITEMS} vehicles max<span className="sr-only">. Remove one to add another.</span></span>
      <button type="button" onClick={onOpen} className="shrink-0 text-xs font-semibold underline underline-offset-2">Open cart</button>
    </div>
  );
}
