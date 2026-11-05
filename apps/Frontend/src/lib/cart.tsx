import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CartItem {
  modelId: string;
  shopId: string;
  make: string;
  model: string;
  shopName: string;
  /** paise, per day, per unit */
  pricePerDay: number;
  /** one real vehicleId per unit requested — length is this line's qty */
  vehicleIds: string[];
  /** full pool this line's ids were drawn from — lets the cart drawer increase qty without re-fetching */
  availableVehicleIds: string[];
}

export interface CartLine {
  modelId: string;
  shopId: string;
  make: string;
  model: string;
  shopName: string;
  pricePerDay: number;
}

// Matches the backend's CreateHoldSchema ("items" array, max 5) — now counted
// in total units across all lines, not distinct lines.
export const MAX_CART_ITEMS = 5;

const STORAGE_KEY = "retromobi.cart.v1";

function readStoredCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop anything saved under an older cart shape — missing either array
    // would crash totalUnits/the drawer's qty controls below.
    return parsed.filter((i) => Array.isArray(i?.vehicleIds) && Array.isArray(i?.availableVehicleIds));
  } catch {
    return [];
  }
}

interface CartContextValue {
  items: CartItem[];
  totalUnits: number;
  qtyFor: (modelId: string, shopId: string) => number;
  /** Sets this line's qty (0 removes it). `availableVehicleIds` is the pool to
   *  pull unit ids from when increasing — pass the line's own current ids
   *  when only decreasing/removing. */
  setQty: (line: CartLine, qty: number, availableVehicleIds: string[]) => "ok" | "full";
  clear: () => void;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  limitReached: boolean;
  dismissLimit: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStoredCart);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [limitReached, setLimitReached] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage unavailable (private mode, quota) — cart just won't persist across reloads
    }
  }, [items]);

  const totalUnits = items.reduce((sum, i) => sum + i.vehicleIds.length, 0);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      totalUnits,
      qtyFor: (modelId, shopId) =>
        items.find((i) => i.modelId === modelId && i.shopId === shopId)?.vehicleIds.length ?? 0,
      setQty: (line, qty, availableVehicleIds) => {
        const unitsInOtherLines = items
          .filter((i) => !(i.modelId === line.modelId && i.shopId === line.shopId))
          .reduce((sum, i) => sum + i.vehicleIds.length, 0);
        const clamped = Math.max(0, Math.min(qty, availableVehicleIds.length));
        if (unitsInOtherLines + clamped > MAX_CART_ITEMS) {
          setLimitReached(true);
          return "full";
        }
        setLimitReached(false);

        setItems((prev) => {
          const rest = prev.filter((i) => !(i.modelId === line.modelId && i.shopId === line.shopId));
          if (clamped === 0) return rest;
          return [...rest, { ...line, vehicleIds: availableVehicleIds.slice(0, clamped), availableVehicleIds }];
        });
        return "ok";
      },
      clear: () => { setItems([]); setLimitReached(false); },
      drawerOpen,
      openDrawer: () => { setDrawerOpen(true); setLimitReached(false); },
      closeDrawer: () => setDrawerOpen(false),
      limitReached,
      dismissLimit: () => setLimitReached(false),
    }),
    [items, totalUnits, drawerOpen, limitReached],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
