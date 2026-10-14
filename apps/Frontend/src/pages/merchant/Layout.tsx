import { createContext, useContext, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { usePortalSession, portalFetch, PortalApiError, type Row } from "../../lib/portal";

interface MerchantCtx {
  token: string;
  shops: Row[];
  shopId: string | null;
  setShopId: (id: string) => void;
}

const Ctx = createContext<MerchantCtx | null>(null);

export function useMerchantShop(): MerchantCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMerchantShop must be used inside MerchantLayout");
  return ctx;
}

const NAV = [
  { href: "/merchant", label: "Overview" },
  { href: "/merchant/bookings", label: "Bookings" },
  { href: "/merchant/fleet", label: "Fleet & docs" },
  { href: "/merchant/branches", label: "Branches" },
  { href: "/merchant/payouts", label: "Payouts" },
  { href: "/merchant/compliance", label: "Compliance" },
  { href: "/merchant/support", label: "Support" },
];

export function MerchantLayout({ children }: { children: React.ReactNode }) {
  const { session, logout } = usePortalSession("merchant");
  const [path, navigate] = useLocation();
  const [shops, setShops] = useState<Row[]>([]);
  const [shopId, setShopId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!session) {
      navigate("/merchant/login");
      return;
    }
    portalFetch<{ shops: Row[] }>("merchant", "/shops", { token: session.accessToken })
      .then((r) => {
        setShops(r.shops);
        setShopId((r.shops[0]?.id as string) ?? null);
        setLoaded(true);
      })
      .catch((err) => {
        if (err instanceof PortalApiError && err.status === 401) {
          logout();
          navigate("/merchant/login");
          return;
        }
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  if (!session) return null;

  return (
    <div className="min-h-screen flex bg-surface-2">
      <aside className="w-60 shrink-0 bg-surface border-r border-line flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-line font-semibold text-ink">
          retromobi <span className="ml-1.5 text-xs font-normal text-ink-3">for shops</span>
        </div>

        {loaded && shops.length > 0 && (
          <div className="px-4 py-3 border-b border-line">
            <label className="text-[11px] uppercase tracking-wide text-ink-3">Shop</label>
            <select
              value={shopId ?? ""}
              onChange={(e) => setShopId(e.target.value)}
              className="w-full mt-1 text-sm bg-transparent outline-none text-ink font-medium"
            >
              {shops.map((s) => (
                <option key={String(s.id)} value={String(s.id)}>
                  {String(s.name)}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav className="flex-1 flex flex-col gap-0.5 p-3">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-row px-3 py-2 text-sm ${path === n.href ? "bg-surface-3 text-ink font-medium" : "text-ink-2 hover:bg-surface-3"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => {
            logout();
            navigate("/merchant/login");
          }}
          className="m-3 h-9 rounded-row border border-line-strong text-sm text-ink-2 hover:bg-surface-3"
        >
          Sign out
        </button>
      </aside>

      <main className="flex-1 min-w-0 p-8">
        {!loaded && <p className="text-sm text-ink-3">Loading…</p>}

        {loaded && shops.length === 0 && (
          <p className="text-sm text-ink-3 bg-surface rounded-panel border border-line px-5 py-4 max-w-md">
            This account has no shop yet. Shop creation isn't built in this preview — create one directly
            via <code className="text-ink-2">POST /api/merchant/shops</code>, then refresh.
          </p>
        )}

        {loaded && shops.length > 0 && shopId && (
          <Ctx.Provider value={{ token: session.accessToken, shops, shopId, setShopId }}>
            {children}
          </Ctx.Provider>
        )}
      </main>
    </div>
  );
}
