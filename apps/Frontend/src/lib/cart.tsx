import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { portalFetch, usePortalSession } from "./portal";
import { defaultWindow } from "./searchParams";

export interface CartItem {
  modelId: string;
  shopId: string;
  make: string;
  model: string;
  shopName: string;
  /** paise, per day, per unit */
  pricePerDay: number;
  pickupAt?: string;
  returnAt?: string;
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
  pickupAt?: string;
  returnAt?: string;
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

/**
 * Drops vehicles the server says can no longer be booked, and any line left with
 * nothing in it. Both arrays are filtered: `availableVehicleIds` is the pool
 * `setQty` promotes extra units out of without re-fetching, so a stale id left
 * there comes back the moment someone bumps the quantity.
 *
 * Pure, and separate from the provider, so the interesting half is testable
 * without rendering anything.
 */
export function pruneCart(items: CartItem[], unavailable: string[]): CartItem[] {
  if (unavailable.length === 0) return items;
  const gone = new Set(unavailable);
  return items
    .map((item) => ({
      ...item,
      vehicleIds: item.vehicleIds.filter((id) => !gone.has(id)),
      availableVehicleIds: item.availableVehicleIds.filter((id) => !gone.has(id)),
    }))
    .filter((item) => item.vehicleIds.length > 0);
}

interface CartContextValue {
  items: CartItem[];
  totalUnits: number;
  /** Sets this line's qty (0 removes it). `availableVehicleIds` is the pool to
   *  pull unit ids from when increasing — pass the line's own current ids
   *  when only decreasing/removing. */
  setQty: (line: CartLine, qty: number, availableVehicleIds: string[]) => "ok" | "full";
  clear: () => void;
  /** Re-checks the cart against the server and silently drops what is gone. */
  revalidate: () => Promise<void>;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  limitNoticeId: number;
  dismissLimit: () => void;
  /** `count` vehicles were just removed as unavailable. `id` re-triggers the toast. */
  removedNotice: { id: number; count: number };
  dismissRemoved: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStoredCart);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [limitNoticeId, setLimitNoticeId] = useState(0);
  const [removedNotice, setRemovedNotice] = useState({ id: 0, count: 0 });
  const { session } = usePortalSession("user");

  /**
   * The cart outlives the page: it is in localStorage, so it routinely holds
   * vehicles that were bookable when they were added and are not now — taken
   * off the road for servicing, unlisted, or booked by someone else. Dropping
   * them quietly here beats a 409 at checkout, after the rider has been picked.
   *
   * Never the authority: `createHold` enforces the same rules server-side, and
   * a failure here leaves the cart exactly as it was.
   */
  const revalidate = useCallback(async () => {
    const current = itemsRef.current;
    if (current.length === 0) return;

    const lines = current.map((item) => {
      const win = item.pickupAt && item.returnAt
        ? { pickupAt: item.pickupAt, returnAt: item.returnAt }
        : defaultWindow();
      return {
        vehicleIds: [...new Set([...item.vehicleIds, ...item.availableVehicleIds])].slice(0, 25),
        ...win,
      };
    });

    let unavailable: string[];
    try {
      ({ unavailable } = await portalFetch<{ unavailable: string[] }>("user", "/search/availability", {
        method: "POST",
        body: { lines },
      }));
    } catch {
      return; // offline, rate-limited, whatever — the cart is not the place to shout about it
    }
    if (unavailable.length === 0) return;

    setItems((prev) => {
      const next = pruneCart(prev, unavailable);
      const lost = prev.reduce((n, i) => n + i.vehicleIds.length, 0)
        - next.reduce((n, i) => n + i.vehicleIds.length, 0);
      if (lost > 0) setRemovedNotice((n) => ({ id: n.id + 1, count: lost }));
      return next;
    });
  }, []);

  // On load, and again whenever someone signs in — the gap between adding to a
  // cart and coming back to pay is exactly where a vehicle goes away.
  useEffect(() => {
    void revalidate();
  }, [revalidate, session?.accessToken]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage unavailable (private mode, quota) — cart just won't persist across reloads
    }
  }, [items]);

  // So `revalidate` can read the current cart without taking `items` as a
  // dependency — which would re-run it on every change, including its own.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const totalUnits = items.reduce((sum, i) => sum + i.vehicleIds.length, 0);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      totalUnits,
      setQty: (line, qty, availableVehicleIds) => {
        const unitsInOtherLines = items
          .filter((i) => !(i.modelId === line.modelId && i.shopId === line.shopId))
          .reduce((sum, i) => sum + i.vehicleIds.length, 0);
        const clamped = Math.max(0, Math.min(qty, availableVehicleIds.length));
        if (unitsInOtherLines + clamped > MAX_CART_ITEMS) {
          setLimitNoticeId((id) => id + 1);
          return "full";
        }
        setLimitNoticeId(0);

        setItems((prev) => {
          const rest = prev.filter((i) => !(i.modelId === line.modelId && i.shopId === line.shopId));
          if (clamped === 0) return rest;
          return [...rest, { ...line, vehicleIds: availableVehicleIds.slice(0, clamped), availableVehicleIds }];
        });
        return "ok";
      },
      clear: () => { setItems([]); setLimitNoticeId(0); },
      revalidate,
      drawerOpen,
      openDrawer: () => { setDrawerOpen(true); setLimitNoticeId(0); },
      closeDrawer: () => setDrawerOpen(false),
      limitNoticeId,
      dismissLimit: () => setLimitNoticeId(0),
      removedNotice,
      dismissRemoved: () => setRemovedNotice((n) => ({ ...n, count: 0 })),
    }),
    [items, totalUnits, drawerOpen, limitNoticeId, removedNotice, revalidate],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
