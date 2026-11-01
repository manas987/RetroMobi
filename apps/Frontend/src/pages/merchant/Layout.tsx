import { createContext, useContext, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { usePortalSession, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { ErrorBox, SubmitButton, TextField } from "../../components/AuthFormBits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { ExternalLink, Store } from "lucide-react";
import { can as hasPermission, type Permission } from "../../lib/permissions";

interface MerchantCtx {
  token: string;
  shops: Row[];
  shopId: string | null;
  setShopId: (id: string) => void;
  reloadShops: () => void;
  /** The signed-in member's role at the *selected* shop — it can differ per branch. */
  role: string | null;
  /** Render gate only; the server is still the enforcer. */
  can: (permission: Permission) => boolean;
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
  { href: "/merchant/team", label: "Team" },
  { href: "/merchant/payouts", label: "Payouts" },
  { href: "/merchant/compliance", label: "Compliance" },
  { href: "/merchant/support", label: "Support" },
];

/** Which shop the merchant was last managing. Kept out of the URL so every
 *  page doesn't have to carry a ?shopId, but persisted so a refresh or a new
 *  tab doesn't silently drop a multi-branch merchant back onto branch #1. */
const SHOP_KEY = "retromobi_merchant_shop";

function rememberedShopId(): string | null {
  try {
    return localStorage.getItem(SHOP_KEY);
  } catch {
    return null;
  }
}

export function MerchantLayout({ children }: { children: React.ReactNode }) {
  const { session, logout } = usePortalSession("merchant");
  const [path, navigate] = useLocation();
  const [shops, setShops] = useState<Row[]>([]);
  const [shopId, setShopIdState] = useState<string | null>(rememberedShopId);

  const setShopId = (id: string) => {
    setShopIdState(id);
    try {
      localStorage.setItem(SHOP_KEY, id);
    } catch {
      // Private browsing: the switch still works, it just won't be remembered.
    }
  };
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!session) {
      navigate("/merchant/login");
      return;
    }
    portalFetch<{ shops: Row[] }>("merchant", "/shops", { token: session.accessToken })
      .then((r) => {
        setShops(r.shops);
        // A remembered id that no longer belongs to this merchant (shop
        // deleted, or a different account signed in) must not stick.
        setShopIdState((prev) =>
          prev && r.shops.some((s) => s.id === prev) ? prev : ((r.shops[0]?.id as string) ?? null),
        );
        setLoaded(true);
      })
      .catch((err) => {
        if (err instanceof PortalApiError && err.status === 401) {
          logout();
          navigate("/merchant/login");
          return;
        }
        // Anything else is a real failure. Without this the catch fell through
        // to `loaded` with an empty list, so a 500 showed an established
        // merchant the "Set up your first shop" form.
        setLoadError(err instanceof Error ? err.message : "Couldn't load your shops.");
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken, reloadKey]);

  if (!session) return null;

  const currentShop = shops.find((s) => String(s.id) === shopId);
  const role = currentShop ? String(currentShop.role ?? "") || null : null;

  return (
    <div className="min-h-screen flex bg-surface-2">
      <aside className="w-60 shrink-0 bg-surface border-r border-line flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-line font-semibold text-ink">
          retromobi <span className="ml-1.5 text-xs font-normal text-ink-3">for shops</span>
        </div>

        {loaded && shops.length > 0 && (
          <ShopSwitcher shops={shops} shopId={shopId} onChange={setShopId} />
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

        {loadError && (
          <div className="max-w-md">
            <ErrorBox text={loadError} />
            <button
              type="button"
              onClick={() => {
                setLoadError(null);
                setReloadKey((k) => k + 1);
              }}
              className="text-sm text-ink font-medium hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {!loadError && loaded && shops.length === 0 && (
          <FirstShopForm token={session.accessToken} onCreated={() => setReloadKey((k) => k + 1)} />
        )}

        {!loadError && loaded && shops.length > 0 && shopId && (
          <Ctx.Provider
            value={{
              token: session.accessToken,
              shops,
              shopId,
              setShopId,
              reloadShops: () => setReloadKey((k) => k + 1),
              role,
              can: (permission) => hasPermission(role, permission),
            }}
          >
            {children}
          </Ctx.Provider>
        )}
      </main>
    </div>
  );
}

function ShopSwitcher({
  shops,
  shopId,
  onChange,
}: {
  shops: Row[];
  shopId: string | null;
  onChange: (id: string) => void;
}) {
  const current = shops.find((s) => String(s.id) === shopId);

  return (
    <div className="px-4 py-3 border-b border-line">
      <span className="text-[11px] uppercase tracking-wide text-ink-3">Shop</span>
      {shops.length === 1 ? (
        <p className="mt-1 text-sm font-medium text-ink truncate">{String(current?.name ?? "")}</p>
      ) : (
        <Select value={shopId ?? ""} onValueChange={onChange}>
          {/* Overrides the shared trigger's capsule (rounded-full) shape —
              that's built for one line of text, not this name+status pair,
              and stretching a pill around two lines is what looked odd. */}
          <SelectTrigger className="w-full mt-1 rounded-row h-auto py-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {shops.map((s) => {
              const name = String(s.name ?? "");
              const city = String(s.city ?? "");
              const unverified = s.verification_status !== "VERIFIED";
              // A shop named the same as its own city (seen in test data, but
              // not impossible in real data either) made this line repeat the
              // title verbatim — show the city only when it adds information.
              const showCity = city && city.trim().toLowerCase() !== name.trim().toLowerCase();
              return (
                <SelectItem key={String(s.id)} value={String(s.id)}>
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-medium">{name}</span>
                    {(showCity || unverified) && (
                      <span className="text-xs text-ink-3">
                        {showCity && city}
                        {showCity && unverified ? " · unverified" : unverified ? "Unverified" : ""}
                      </span>
                    )}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      )}

      {current && (
        <div className="mt-2 flex flex-col gap-1.5">
          {/* City and verification already show in the trigger above — this
              row adds only what that one doesn't: open/closed. */}
          <span className="flex items-center gap-1.5 text-xs text-ink-3">
            <Store className="h-3 w-3" />
            {current.status === "OPEN" ? "Open for business" : "Closed"}
          </span>
          {/* The merchant's own listing as a rider sees it — the fastest way
              to check that a price or a photo landed the way they meant. */}
          <a
            href={`/shops/${String(current.id)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink hover:underline"
          >
            View public page <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}

function FirstShopForm({ token, onCreated }: { token: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("Uttarakhand");
  const [pincode, setPincode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", "/shops", {
        method: "POST",
        token,
        body: { name, addressLine1, city, state, pincode },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't create that shop.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold text-ink mb-1">Set up your first shop</h1>
      <p className="text-sm text-ink-3 mb-6">This is where your fleet, bookings and payouts will live.</p>
      {error && <ErrorBox text={error} />}
      <TextField label="Shop name" value={name} onChange={setName} autoFocus />
      <TextField label="Address" value={addressLine1} onChange={setAddressLine1} />
      <TextField label="City" value={city} onChange={setCity} />
      <TextField label="State" value={state} onChange={setState} />
      <TextField label="Pincode" value={pincode} onChange={setPincode} />
      <SubmitButton busy={busy} disabled={!name || !addressLine1 || !city || !state || pincode.length !== 6} onClick={submit}>
        Create shop
      </SubmitButton>
    </div>
  );
}
