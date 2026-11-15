import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Bike,
  Building2,
  CalendarCheck,
  ChevronsLeft,
  ChevronsRight,
  BarChart3,
  ExternalLink,
  History,
  Home,
  IndianRupee,
  Languages,
  LayoutGrid,
  LogOut,
  Menu,
  MessageCircle,
  ScrollText,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import { usePortalSession, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { ErrorBox } from "../../components/AuthFormBits";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { can as hasPermission, type Permission } from "../../lib/permissions";
import { setLang, useT, type TKey } from "../../i18n";
import { errorText, useMerchantQuery } from "./query";
import { Button, ErrorNote, Field, INPUT, Sheet } from "./ui/ui";
import { GetListedChip, useSetupPending } from "./setup/GetListedChip";
import { InvitesForYou } from "./staff/InvitesForYou";

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
  /** The signed-in person's own name, for the greeting. Null while loading. */
  myName: string | null;
}

const Ctx = createContext<MerchantCtx | null>(null);

export function useMerchantShop(): MerchantCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMerchantShop must be used inside MerchantLayout");
  return ctx;
}

interface NavItem {
  href: string;
  label: TKey;
  icon: LucideIcon;
  needs?: Permission;
  /** Only shown to someone who can see two or more shops. */
  multiOnly?: boolean;
}

/**
 * Grouped so a first-time user can find things by what they're doing, not by
 * system name. Items a role can't use are hidden, as in the admin layout.
 * Each later phase adds its page here (Reports, Activity log).
 */
const NAV: { group: TKey; items: NavItem[] }[] = [
  { group: "nav.groupToday", items: [{ href: "/merchant", label: "nav.overview", icon: Home }] },
  {
    group: "nav.groupWork",
    items: [
      { href: "/merchant/bookings", label: "nav.bookings", icon: CalendarCheck },
      { href: "/merchant/fleet", label: "nav.fleet", icon: Bike },
      { href: "/merchant/support", label: "nav.support", icon: MessageCircle },
    ],
  },
  {
    group: "nav.groupMoney",
    items: [
      { href: "/merchant/earnings", label: "nav.earnings", icon: IndianRupee, needs: "payouts:read" },
      { href: "/merchant/reports", label: "nav.reports", icon: BarChart3, needs: "payouts:read" },
    ],
  },
  {
    group: "nav.groupShop",
    items: [
      { href: "/merchant/shop", label: "nav.shop", icon: Store },
      { href: "/merchant/staff", label: "nav.staff", icon: Users, needs: "members:read" },
      { href: "/merchant/activity", label: "nav.activity", icon: History, needs: "members:read" },
    ],
  },
  // Things that span every branch. Last, so the phone tab bar's NAV[0..2] indexes don't move.
  {
    group: "nav.groupAllShops",
    items: [
      { href: "/merchant/shops", label: "nav.allBranches", icon: Building2 },
      { href: "/merchant/papers", label: "nav.documents", icon: ScrollText },
      { href: "/merchant/all-vehicles", label: "nav.allVehicles", icon: LayoutGrid, multiOnly: true },
    ],
  },
];

/** Which shop the merchant was last managing. Kept out of the URL so every
 *  page doesn't have to carry a ?shopId, but persisted so a refresh or a new
 *  tab doesn't silently drop a multi-branch merchant back onto branch #1. */
const SHOP_KEY = "retromobi_merchant_shop";
const COLLAPSE_KEY = "retromobi_merchant_nav_collapsed";

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing: it still works, it just won't be remembered.
  }
}

function isActive(path: string, href: string) {
  return href === "/merchant" ? path === href : path === href || path.startsWith(`${href}/`);
}

export function MerchantLayout({ children }: { children: React.ReactNode }) {
  const { session, logout } = usePortalSession("merchant");
  const [path, navigate] = useLocation();
  const { t } = useT();
  const [storedShopId, setShopIdState] = useState<string | null>(() => readStored(SHOP_KEY));
  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSE_KEY) === "1");
  const [menuOpen, setMenuOpen] = useState(false);

  const setShopId = (id: string) => {
    setShopIdState(id);
    writeStored(SHOP_KEY, id);
  };

  // Every merchant page mounts its own MerchantLayout, so this runs on every
  // tab change. Through the query cache the shell redraws instantly from the
  // last answer instead of flashing "Loading…" -- that flash was the flicker.
  const token = session?.accessToken ?? "";
  const shopsQ = useMerchantQuery<{ shops: Row[] }>(session ? "/shops" : null, token);
  const me = useMerchantQuery<{ name: string | null }>(session ? "/me" : null, token);
  const shops = shopsQ.data?.shops ?? [];
  const loaded = shopsQ.isSuccess || shopsQ.isError;
  const unauthorised = shopsQ.error instanceof PortalApiError && shopsQ.error.status === 401;
  // A real failure must not fall through to an empty list, or an established
  // merchant would be shown the "set up your first shop" form.
  const loadError = shopsQ.isError && !unauthorised ? t("common.couldntLoad") : null;
  // A remembered id that no longer belongs to this merchant (shop deleted, or
  // a different account signed in) must not stick.
  const shopId =
    storedShopId && shops.some((s) => s.id === storedShopId) ? storedShopId : ((shops[0]?.id as string | undefined) ?? null);

  useEffect(() => {
    if (!session || unauthorised) {
      if (unauthorised) logout();
      navigate("/merchant/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, unauthorised]);

  // Close the phone menu whenever the page changes.
  useEffect(() => setMenuOpen(false), [path]);
  const setupPending = useSetupPending(token,
    shopId && hasPermission(String(shops.find((s) => s.id === shopId)?.role ?? "") || null, "fleet:read") ? shopId : null);

  if (!session) return null;

  const currentShop = shops.find((s) => String(s.id) === shopId);
  const role = currentShop ? String(currentShop.role ?? "") || null : null;
  const can = (permission: Permission) => hasPermission(role, permission);
  const myName = me.data?.name ?? null;

  const signOut = () => {
    logout();
    navigate("/merchant/login");
  };

  const multi = shops.filter((s) => hasPermission(String(s.role ?? ""), "fleet:read")).length > 1;
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => (!i.needs || can(i.needs)) && (!i.multiOnly || multi)) })).filter(
    (g) => g.items.length > 0,
  );

  // Five thumb-reachable slots on a phone; everything else is under "More".
  const tabBar: NavItem[] = [
    NAV[0]!.items[0]!,
    NAV[1]!.items[0]!,
    NAV[1]!.items[1]!,
    can("payouts:read") ? NAV[2]!.items[0]! : NAV[1]!.items[2]!,
  ];

  return (
    <div className="min-h-dvh bg-canvas lg:flex">
      {/* ---- desktop sidebar ---- */}
      <aside
        className={`hidden lg:flex sticky top-0 h-dvh shrink-0 flex-col bg-surface border-r border-line transition-[width] ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        <div className="flex h-16 items-center justify-between gap-2 px-4 border-b border-line">
          {!collapsed && (
            <span className="font-semibold text-ink">
              retromobi <span className="ml-1 text-xs font-normal text-ink-3">for shops</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setCollapsed((c) => !c);
              writeStored(COLLAPSE_KEY, collapsed ? "0" : "1");
            }}
            aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-3 hover:bg-surface-3 hover:text-ink"
          >
            {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
          </button>
        </div>

        {!collapsed && loaded && shops.length > 0 && (
          <ShopSwitcher shops={shops} shopId={shopId} onChange={setShopId} />
        )}

        {shopId && can("fleet:read") && <GetListedChip collapsed={collapsed} token={token} shopId={shopId} />}
        <NavList groups={groups} path={path} collapsed={collapsed} dense />

        {/* Kept short: the nav above has to fit a 768-900px laptop screen. */}
        <div className="border-t border-line p-3 flex flex-col gap-2">
          <div className={`flex gap-2 ${collapsed ? "flex-col" : "items-center"}`}>
            {currentShop && <ShopPageLink shopId={String(currentShop.id)} compact={collapsed} />}
            <LangPill compact={collapsed} />
          </div>
          <UserChip name={myName} role={role} collapsed={collapsed} onSignOut={signOut} />
        </div>
      </aside>

      {/* ---- phone top bar ---- */}
      <header className="lg:hidden sticky top-0 z-20 flex h-14 items-center justify-between gap-2 bg-surface/95 backdrop-blur border-b border-line px-4">
        <span className="font-semibold text-ink truncate">{String(currentShop?.name ?? "retromobi")}</span>
        <LangPill />
      </header>

      <div className="flex-1 min-w-0">
        <main className="px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:py-6">
          {!loaded && <p className="text-sm text-ink-3">{t("common.loading")}</p>}

          {loadError && (
            <div className="max-w-md">
              <ErrorBox text={loadError} />
              <button
                type="button"
                onClick={() => void shopsQ.refetch()}
                className="text-sm text-ink font-medium hover:underline"
              >
                {t("common.retry")}
              </button>
            </div>
          )}

          {!loadError && loaded && shops.length === 0 && (
            <div className="max-w-md">
              <InvitesForYou token={session.accessToken} onAccepted={() => void shopsQ.refetch()} className="mb-4" />
              <FirstShopForm token={session.accessToken} onCreated={() => void shopsQ.refetch()} />
            </div>
          )}

          {!loadError && loaded && shops.length > 0 && shopId && (
            <Ctx.Provider
              value={{
                token: session.accessToken,
                shops,
                shopId,
                setShopId,
                reloadShops: () => void shopsQ.refetch(),
                role,
                can,
                myName,
              }}
            >
              {children}
            </Ctx.Provider>
          )}
        </main>
      </div>

      {/* ---- phone tab bar ---- */}
      <nav className="lg:hidden fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]">
        {tabBar.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              isActive(path, item.href) ? "text-ink" : "text-ink-3"
            }`}
          >
            <span className={`inline-flex h-8 w-12 items-center justify-center rounded-full ${isActive(path, item.href) ? "bg-amber" : ""}`}>
              <item.icon className="h-5 w-5" aria-hidden />
            </span>
            {t(item.label)}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-3"
        >
          <span className="relative inline-flex h-8 w-12 items-center justify-center">
            <Menu className="h-5 w-5" aria-hidden />
            {setupPending && <span className="absolute right-2.5 top-1 h-2.5 w-2.5 rounded-full bg-amber-edge" aria-label={t("setup.chipTitle")} />}
          </span>
          {t("common.more")}
        </button>
      </nav>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t("common.menu")}>
        {loaded && shops.length > 0 && <ShopSwitcher shops={shops} shopId={shopId} onChange={setShopId} />}
        {shopId && can("fleet:read") && <GetListedChip collapsed={false} token={token} shopId={shopId} />}
        <NavList groups={groups} path={path} collapsed={false} />
        <div className="mt-4 border-t border-line pt-4 flex flex-col gap-3">
          {currentShop && <ShopPageLink shopId={String(currentShop.id)} compact={false} />}
          <UserChip name={myName} role={role} collapsed={false} onSignOut={signOut} />
        </div>
      </Sheet>
    </div>
  );
}

function NavList({
  groups,
  path,
  collapsed,
  dense = false,
}: {
  groups: { group: TKey; items: NavItem[] }[];
  path: string;
  collapsed: boolean;
  /** Desktop sidebar: 40px rows (mouse) so the whole list fits a laptop screen. */
  dense?: boolean;
}) {
  const { t } = useT();
  // On a short screen the list scrolls; never leave the page you're on out of sight.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [path]);
  return (
    <nav ref={ref} className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.group}>
          {!collapsed && (
            <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-4">{t(g.group)}</p>
          )}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const active = isActive(path, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={collapsed ? t(item.label) : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`flex ${dense ? "min-h-10" : "min-h-11"} items-center gap-3 rounded-2xl px-3 text-[15px] ${collapsed ? "justify-center" : ""} ${
                      active ? "bg-ink text-surface font-medium" : "text-ink-2 hover:bg-surface-3 hover:text-ink"
                    }`}
                  >
                    <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                    {collapsed ? <span className="sr-only">{t(item.label)}</span> : t(item.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** The merchant's listing as a rider sees it — the fastest way to check that
 *  a price or a photo landed the way they meant. */
function ShopPageLink({ shopId, compact }: { shopId: string; compact: boolean }) {
  const { t } = useT();
  return (
    <a
      href={`/shops/${shopId}`}
      target="_blank"
      rel="noreferrer"
      title={t("common.yourShopPage")}
      className={`flex min-h-10 min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2.5 text-sm text-ink-2 hover:bg-surface-3 hover:text-ink ${compact ? "justify-center" : ""}`}
    >
      {compact ? <span className="sr-only">{t("common.yourShopPage")}</span> : <span className="truncate">{t("common.yourShopPage")}</span>}
      <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
    </a>
  );
}

/** Always visible, always in the *other* language, so someone who can't read
 *  the current one can still find the way back. */
function LangPill({ compact = false }: { compact?: boolean }) {
  const { t, lang } = useT();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "hi" : "en")}
      aria-label={t("common.otherLangLabel")}
      title={compact ? t("common.otherLangLabel") : undefined}
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface text-sm font-semibold text-ink hover:bg-surface-3 ${
        compact ? "w-10 self-center" : "px-3.5"
      }`}
    >
      <Languages className="h-4 w-4 shrink-0" aria-hidden />
      {compact ? <span className="sr-only">{t("common.otherLang")}</span> : t("common.otherLang")}
    </button>
  );
}

function UserChip({
  name,
  role,
  collapsed,
  onSignOut,
}: {
  name: string | null;
  role: string | null;
  collapsed: boolean;
  onSignOut: () => void;
}) {
  const { t, tMaybe } = useT();
  const initials = (name ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={`flex items-center gap-3 ${collapsed ? "flex-col" : ""}`}>
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber text-sm font-semibold text-on-amber">
        {initials}
      </span>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{name ?? "—"}</p>
          {role && <p className="text-xs text-ink-3">{tMaybe(`common.role_${role}`) ?? role}</p>}
        </div>
      )}
      <button
        type="button"
        onClick={onSignOut}
        aria-label={t("common.signOut")}
        title={t("common.signOut")}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-3 hover:bg-surface-3 hover:text-ink"
      >
        <LogOut className="h-5 w-5" />
      </button>
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
  const { t, tMaybe } = useT();
  const current = shops.find((s) => String(s.id) === shopId);

  // Name on one line; city and open/closed under it. Left-aligned and
  // truncated -- a long branch name must never wrap into a centred block.
  const label = (s: Row | undefined, withStatus: boolean) => {
    if (!s) return null;
    const name = String(s.name ?? "");
    const city = String(s.city ?? "");
    const showCity = city && !name.toLowerCase().includes(city.trim().toLowerCase());
    const open = s.status === "OPEN";
    return (
      <span className="flex min-w-0 flex-col items-start text-left leading-tight">
        <span className="w-full truncate text-sm font-semibold text-ink">{name}</span>
        <span className="flex w-full items-center gap-1.5 text-xs text-ink-3">
          {withStatus && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${open ? "bg-verified" : "bg-ink-4"}`} aria-hidden />}
          <span className="truncate">
            {[showCity ? city : null, withStatus ? (open ? t("common.shopOpen") : t("common.shopClosed")) : null,
              withStatus && s.verification_status !== "VERIFIED" ? tMaybe(`status.verify_${String(s.verification_status)}`) : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      </span>
    );
  };

  return (
    <div className="px-3 py-3 border-b border-line">
      <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-4">{t("common.shop")}</span>
      {shops.length === 1 ? (
        <div className="mt-1 px-1">{label(current, true)}</div>
      ) : (
        <Select value={shopId ?? ""} onValueChange={onChange}>
          <SelectTrigger className="mt-1 h-auto min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left">
            {/* Radix drops SelectValue's className, so the shrinking wrapper is ours. */}
            <span className="min-w-0 flex-1 overflow-hidden">
              <SelectValue>{label(current, true)}</SelectValue>
            </span>
          </SelectTrigger>
          <SelectContent>
            {shops.map((s) => (
              <SelectItem key={String(s.id)} value={String(s.id)}>
                {label(s, false)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

    </div>
  );
}

function FirstShopForm({ token, onCreated }: { token: string; onCreated: () => void }) {
  const { t, lang } = useT();
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
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card bg-surface p-6 shadow-card">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-ink">
        <Store className="h-6 w-6 shrink-0" aria-hidden />
        {t("common.firstShopTitle")}
      </h1>
      <p className="mb-6 text-base text-ink-2">{t("common.firstShopBody")}</p>
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <Field label={t("common.shopName")}><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t("common.address")}><input className={INPUT} value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} /></Field>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label={t("common.city")}><input className={INPUT} value={city} onChange={(e) => setCity(e.target.value)} /></Field>
        <Field label={t("common.pincode")}>
          <input className={`${INPUT} tnum`} inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} />
        </Field>
      </div>
      <Field label={t("common.state")}><input className={INPUT} value={state} onChange={(e) => setState(e.target.value)} /></Field>
      <Button variant="primary" size="lg" className="w-full" disabled={busy || !name || !addressLine1 || !city || !state || pincode.length !== 6} onClick={submit}>
        {busy ? t("common.saving") : t("common.createShop")}
      </Button>
    </div>
  );
}
