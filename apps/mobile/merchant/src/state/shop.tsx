import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { can as hasPermission, type Permission, type Row } from "@retromobi/mobile-shared";

import { useMerchantQuery } from "./query";

const STORAGE_KEY = "retromobi_merchant_shop";

type ShopContext = {
  shops: Row[]; shopId: string | null; setShopId: (id: string) => void;
  role: string | null; can: (permission: Permission) => boolean; myName: string | null;
  loading: boolean; refreshing: boolean; error: Error | null; reloadShops: () => Promise<unknown>;
};

const Context = createContext<ShopContext | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).catch(() => null).then((id) => { if (active) setStored(id); });
    return () => { active = false; };
  }, []);

  const shopsQ = useMerchantQuery<{ shops: Row[] }>("/shops");
  const me = useMerchantQuery<{ name: string | null }>("/me");

  const shops = shopsQ.data?.shops ?? [];
  const current = shops.find((shop) => shop.id === stored) ?? shops[0];
  const shopId = current ? String(current.id) : null;
  const role = current?.role ? String(current.role) : null;
  function setShopId(id: string) {
    if (!shops.some((shop) => shop.id === id)) return;
    setStored(id);
    void AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  }

  return <Context.Provider value={{ shops, shopId, role, setShopId, can: (permission) => hasPermission(role, permission),
    myName: me.data?.name ?? null, loading: shopsQ.isPending || stored === undefined, refreshing: shopsQ.isRefetching, error: shopsQ.error, reloadShops: shopsQ.refetch }}>
    {children}
  </Context.Provider>;
}

export function useMerchantShop() {
  const value = useContext(Context);
  if (!value) throw new Error("useMerchantShop must be used within ShopProvider");
  return value;
}
