import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, defaultWindow, MAX_CART_ITEMS, pruneCart, useSession, useToast, type CartItem, type CartLine } from "@retromobi/mobile-shared";

const STORAGE_KEY = "retromobi.cart.v1";
let loaded: CartItem[] | undefined;
let read: Promise<void> | undefined;
const count = (items: CartItem[]) => items.reduce((sum, line) => sum + line.vehicleIds.length, 0);

export function useCartReady() {
  const [ready, setReady] = useState(loaded !== undefined);
  useEffect(() => {
    read ??= AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      const value: unknown = raw ? JSON.parse(raw) : [];
      loaded = Array.isArray(value) ? value.filter((line) => Array.isArray(line?.vehicleIds) && Array.isArray(line?.availableVehicleIds)) : [];
    }).catch(() => { loaded = []; });
    void read.then(() => setReady(true));
  }, []);
  return ready;
}

type Cart = {
  items: CartItem[]; totalUnits: number;
  setQty: (line: CartLine, qty: number, availableVehicleIds: string[]) => "ok" | "full";
  clear: () => void; revalidate: () => Promise<void>;
};
const CartContext = createContext<Cart | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => loaded ?? []);
  const latest = useRef(items);
  const session = useSession();
  const signedIn = !!session;
  const toast = useToast();
  const replace = useCallback((next: CartItem[]) => {
    latest.current = next;
    loaded = next;
    setItems(next);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const revalidate = useCallback(async () => {
    const snapshot = latest.current;
    if (!snapshot.length) return;
    const lines = snapshot.map((item) => ({
      ...(item.pickupAt && item.returnAt ? { pickupAt: item.pickupAt, returnAt: item.returnAt } : defaultWindow()),
      vehicleIds: [...new Set([...item.vehicleIds, ...item.availableVehicleIds])].slice(0, 25),
    }));
    try {
      const { unavailable } = await api<{ unavailable: string[] }>("/search/availability", { method: "POST", auth: false, body: { lines } });
      // A result for an old selection must never prune newly chosen dates.
      if (latest.current !== snapshot || !unavailable.length) return;
      const next = pruneCart(snapshot, unavailable);
      const lost = count(snapshot) - count(next);
      replace(next);
      if (lost) toast(lost === 1 ? "1 item in your cart is no longer available" : `${lost} items in your cart are no longer available`);
    } catch {
      // A temporary network failure leaves the cart intact; checkout still validates on the server.
    }
  }, [replace, toast]);

  useEffect(() => { void revalidate(); }, [revalidate, signedIn]);

  function setQty(line: CartLine, qty: number, availableVehicleIds: string[]) {
    const rest = latest.current.filter((item) => item.modelId !== line.modelId || item.shopId !== line.shopId);
    const pool = [...new Set(availableVehicleIds)];
    const clamped = Math.max(0, Math.min(qty, pool.length));
    if (count(rest) + clamped > MAX_CART_ITEMS) {
      toast("Cart full · 5 vehicles max");
      return "full";
    }
    replace(clamped ? [...rest, { ...line, vehicleIds: pool.slice(0, clamped), availableVehicleIds: pool }] : rest);
    return "ok";
  }

  return <CartContext.Provider value={{ items, totalUnits: count(items), setQty, clear: () => replace([]), revalidate }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used within CartProvider");
  return value;
}
