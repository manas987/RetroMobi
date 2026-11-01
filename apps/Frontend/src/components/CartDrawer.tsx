import * as Dialog from "@radix-ui/react-dialog";
import { useLocation } from "wouter";
import { Minus, Plus, X } from "lucide-react";
import { useCart } from "../lib/cart";
import { rupees } from "../lib/format";

export function CartDrawer() {
  const { items, totalUnits, setQty, drawerOpen, closeDrawer } = useCart();
  const [, navigate] = useLocation();

  const subtotal = items.reduce((sum, i) => sum + i.pricePerDay * i.vehicleIds.length, 0);

  return (
    <Dialog.Root open={drawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1100] bg-ink/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed right-0 top-0 z-[1101] h-full w-full max-w-md bg-surface shadow-[-12px_0_32px_rgba(18,22,26,0.14)] flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[state=closed]:duration-200 data-[state=open]:duration-300 data-[state=open]:ease-[cubic-bezier(0.34,1.56,0.64,1)] data-[state=closed]:ease-in">
          <div className="flex items-center justify-between px-5 h-16 border-b border-line shrink-0">
            <Dialog.Title className="text-lg font-semibold text-ink">
              Your cart {totalUnits > 0 && `(${totalUnits})`}
            </Dialog.Title>
            <Dialog.Close className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-3 transition-colors text-ink-2">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {items.length === 0 ? (
              <p className="text-sm text-ink-3 py-10 text-center">
                Nothing in your cart yet. Add a scooter from Browse to start a booking.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {items.map((item) => (
                  <div
                    key={`${item.modelId}:${item.shopId}`}
                    onClick={() => {
                      closeDrawer();
                      navigate(`/vehicles/${item.vehicleIds[0]}`);
                    }}
                    className="flex items-center justify-between gap-3 rounded-panel border border-line px-4 py-3 cursor-pointer hover:border-line-strong transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                        {item.make} {item.model}
                      </p>
                      <p className="text-xs text-ink-3 truncate">{item.shopName}</p>
                      <p className="text-sm text-ink-2 mt-1 tnum">{rupees(item.pricePerDay)}/day</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <div className="h-8 flex items-center gap-1 rounded-full border border-line-strong px-1">
                        <button
                          type="button"
                          onClick={() => setQty(item, item.vehicleIds.length - 1, item.availableVehicleIds)}
                          aria-label={`Remove one ${item.make} ${item.model}`}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-ink hover:bg-surface-3 transition-colors"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-4 text-center text-sm font-medium tnum">{item.vehicleIds.length}</span>
                        <button
                          type="button"
                          onClick={() => setQty(item, item.vehicleIds.length + 1, item.availableVehicleIds)}
                          disabled={item.vehicleIds.length >= item.availableVehicleIds.length}
                          aria-label={`Add one more ${item.make} ${item.model}`}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-ink hover:bg-surface-3 disabled:opacity-30 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setQty(item, 0, item.availableVehicleIds)}
                        aria-label={`Remove ${item.make} ${item.model} from cart`}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:bg-surface-3 hover:text-danger transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="shrink-0 border-t border-line px-5 py-4">
              <div className="flex items-center justify-between text-sm mb-3">
                <span className="text-ink-3">Subtotal (per day, before fees)</span>
                <span className="font-semibold text-ink tnum">{rupees(subtotal)}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  closeDrawer();
                  navigate("/checkout");
                }}
                className="w-full h-11 rounded-row bg-amber text-on-amber font-semibold hover:brightness-95 transition-[filter]"
              >
                Checkout
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
