import { useState } from "react";
import { Link, Redirect, useSearchParams } from "wouter";
import { ExternalLink, Rocket, Store } from "lucide-react";
import { portalFetch, type Row } from "../../lib/portal";
import { useT, type TKey } from "../../i18n";
import { Toggle } from "../../components/Toggle";
import { LocationPicker } from "../../components/LocationPicker";
import { E164Input } from "../../components/PhoneInput";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery, useUrlParam } from "./query";
import { ShopPapersTab } from "./shop/ShopPapersTab";
import { Button, Card, Chip, EmptyState, ErrorNote, Field, INPUT, LoadingRows, PageHeader, PHONE, Tabs } from "./ui/ui";
import { VERIFY_TONE } from "./shop/BranchCard";
import { HoursEditor, hoursFromShop, hoursInvalid, hoursPayload } from "./shop/HoursSheet";
import { PhotosTab } from "./fleet/tabs/PhotosTab";
import type { SetupData } from "./setup/GetListedChip";

export function MerchantShop() {
  return (
    <MerchantLayout>
      <ShopBody />
    </MerchantLayout>
  );
}

/** Old `/merchant/shop?tab=…` links now live on their own pages. */
const MOVED: Record<string, string> = {
  branches: "/merchant/shops", documents: "/merchant/papers", vehicles: "/merchant/all-vehicles",
};

function ShopBody() {
  const [params] = useSearchParams();
  const moved = MOVED[params.get("tab") ?? ""];
  return moved ? <Redirect to={moved} replace /> : <ShopPage />;
}

/** The shop picked in the sidebar: every editable detail on one page, papers one click away. */
function ShopPage() {
  const { t, lang } = useT();
  const { token, shopId, shops, can, reloadShops } = useMerchantShop();
  const invalidate = useInvalidateMerchant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useUrlParam("tab", ["details", "papers"] as const, "details");
  const shop = shops.find((s) => String(s.id) === shopId);
  const full = useMerchantQuery<Row>(shopId ? `/shops/${shopId}` : null, token);
  const setup = useMerchantQuery<SetupData>(shopId && can("fleet:read") ? `/shops/${shopId}/setup` : null, token);

  if (!shop || !shopId) {
    return (
      <Card>
        <EmptyState icon={Store} text={t("shop.noShop")}
          action={<Link href="/merchant/shops" className="inline-flex min-h-11 items-center rounded-2xl bg-amber px-4 text-sm font-semibold text-on-amber">{t("nav.allBranches")}</Link>} />
      </Card>
    );
  }

  const write = can("shop:write");
  const verify = String(shop.verification_status ?? "UNVERIFIED");
  const open = shop.status === "OPEN";
  async function setOpen(on: boolean) {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/shops/${shopId}`, { method: "PATCH", token, body: { status: on ? "OPEN" : "CLOSED" } });
      reloadShops();
      await invalidate();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }
  // The licence plus the required named papers: what "Papers 3 of 5" counts.
  const papers = setup.data && (() => {
    const needed = [...setup.data.papers.business, ...setup.data.papers.shop].filter((p) => p.required);
    const inNow = needed.filter((p) => p.state === "PENDING" || p.state === "VERIFIED").length
      + (["ACTIVE", "PENDING"].includes(setup.data.licence.status) ? 1 : 0);
    return { n: inNow, total: needed.length + 1 };
  })();

  return (
    <div className="@container">
      <PageHeader
        title={String(shop.name)}
        subtitle={[shop.address_line1, shop.city].filter(Boolean).map(String).join(", ")}
        actions={
          <>
            <Chip tone={VERIFY_TONE[verify] ?? "muted"}>{t(`status.verify_${verify}` as TKey)}</Chip>
            {write && (
              <span className="flex min-h-11 items-center gap-2 text-sm text-ink-2">
                <Toggle checked={open} disabled={busy} label={t("common.shopOpen")} onChange={setOpen} />
                {open ? t("common.shopOpen") : t("common.shopClosed")}
              </span>
            )}
          </>
        }
      />
      {/* The three things a merchant comes here for besides editing, in one row. */}
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}

      <Tabs value={tab} onChange={setTab} tabs={[
        { key: "details", label: t("shop.tabDetails") },
        { key: "papers", label: papers ? t("shop.papersButton", papers) : t("shop.tabShopPapers") },
      ]} end={
        <>
          <a href={`/shops/${shopId}`} target="_blank" rel="noreferrer" title={t("shop.preview")}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-ink hover:bg-surface-3">
            <ExternalLink className="h-4 w-4" aria-hidden />
            <span className="hidden @2xl:inline">{t("shop.preview")}</span>
            <span className="@2xl:hidden">{t("shop.previewShort")}</span>
          </a>
          {write && verify !== "VERIFIED" && (
            <Link href="/merchant/setup"><Button variant="primary" icon={Rocket}>{t("shop.getListed")}</Button></Link>
          )}
        </>
      } />
      {tab === "papers" ? <ShopPapersTab key={shopId} shopId={shopId} /> : full.isPending ? <LoadingRows rows={4} /> : full.isError ? <ErrorNote onRetry={() => full.refetch()} /> : (
        // Keyed on the shop so switching shop in the sidebar starts a fresh form.
        <ShopEditor key={shopId} shop={full.data} shopId={shopId} write={write} lockedState={shops.length > 1} />
      )}
    </div>
  );
}

/** Details and hours are one form with one Save; photos save as they're added. */
function ShopEditor({ shop, shopId, write, lockedState }: { shop: Row; shopId: string; write: boolean; lockedState: boolean }) {
  const { t, lang } = useT();
  const { token, reloadShops } = useMerchantShop();
  const invalidate = useInvalidateMerchant();
  const initial = {
    name: String(shop.name ?? ""), phone: String(shop.phone ?? ""), address: String(shop.address_line1 ?? ""),
    landmark: String(shop.landmark ?? ""), city: String(shop.city ?? ""), state: String(shop.state ?? ""),
    pincode: String(shop.pincode ?? ""), email: String(shop.email ?? ""),
    lat: shop.latitude != null ? Number(shop.latitude) : null, lng: shop.longitude != null ? Number(shop.longitude) : null,
  };
  const [v, setV] = useState(initial);
  const [hours, setHours] = useState(() => hoursFromShop(shop));
  const [savedHours, setSavedHours] = useState(() => JSON.stringify(hoursPayload(hoursFromShop(shop))));
  const [savedV, setSavedV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<typeof v>) => { setSaved(false); setV({ ...v, ...patch }); };
  const hoursChanged = JSON.stringify(hoursPayload(hours)) !== savedHours;
  const detailsChanged = JSON.stringify(v) !== JSON.stringify(savedV);

  const missing = [
    !v.name.trim() && t("common.shopName"),
    !v.address.trim() && t("setup.need_address"),
    !v.city.trim() && t("setup.need_city"),
    !/^\d{6}$/.test(v.pincode) && t("setup.need_pincode"),
    hoursInvalid(hours) && t("setup.need_hours"),
  ].filter((x): x is string => Boolean(x));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (detailsChanged) {
        await portalFetch("merchant", `/shops/${shopId}`, {
          method: "PATCH", token,
          body: {
            name: v.name.trim(), phone: v.phone.trim() || undefined, addressLine1: v.address.trim(), landmark: v.landmark.trim(),
            city: v.city.trim(), state: v.state.trim(), pincode: v.pincode, email: v.email.trim() || undefined,
            latitude: v.lat ?? undefined, longitude: v.lng ?? undefined,
          },
        });
        setSavedV(v);
      }
      if (hoursChanged) {
        await portalFetch("merchant", `/shops/${shopId}/hours`, { method: "PUT", token, body: { hours: hoursPayload(hours) } });
        setSavedHours(JSON.stringify(hoursPayload(hours)));
      }
      reloadShops();
      await invalidate();
      setSaved(true);
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  const ro = !write;
  const input = (key: keyof typeof v, label: string, extra: Record<string, unknown> = {}) => (
    <Field label={label}>
      <input className={INPUT} disabled={ro} value={String(v[key] ?? "")} onChange={(e) => set({ [key]: e.target.value } as Partial<typeof v>)} {...extra} />
    </Field>
  );
  const dirty = detailsChanged || hoursChanged;

  return (
    <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card title={t("shop.detailsCard")}>
        <div className="grid gap-x-3 @xl:grid-cols-2">
          {input("name", t("common.shopName"))}
          <Field label={t("setup.shopPhone")}><E164Input value={v.phone} onChange={(phone) => set({ phone })} className={PHONE} placeholder="" /></Field>
        </div>
        {input("address", t("common.address"))}
        {input("landmark", `${t("shop.landmark")} (${t("common.optional")})`, { maxLength: 200, placeholder: t("shop.landmarkHint") })}
        <div className="grid gap-x-3 @xl:grid-cols-3">
          {input("city", t("common.city"))}
          {input("pincode", t("common.pincode"), { inputMode: "numeric", maxLength: 6, onChange: (e: { target: { value: string } }) => set({ pincode: e.target.value.replace(/\D/g, "") }) })}
          <Field label={t("common.state")}>
            <input className={lockedState ? `${INPUT} bg-surface-3` : INPUT} disabled={ro} readOnly={lockedState} value={v.state} onChange={(e) => set({ state: e.target.value })} />
          </Field>
        </div>
        {lockedState && <p className="-mt-2 mb-4 text-xs text-ink-3">{t("shop.stateLocked")}</p>}
        {input("email", `${t("shop.email")} (${t("common.optional")})`, { type: "email" })}
        <p className="mb-2 text-sm font-medium text-ink">{t("setup.pinLabel")}</p>
        <div className={ro ? "pointer-events-none" : ""}><LocationPicker latitude={v.lat} longitude={v.lng} onChange={(lat, lng) => set({ lat, lng })} /></div>
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        <PhotosTab id={shopId} base={`/shops/${shopId}/media`} canWrite={write} mediaType={false} />
        <Card title={t("shop.hoursCard")}>
          <fieldset disabled={ro} className="min-w-0">
            <HoursEditor value={hours} onChange={(h) => { setSaved(false); setHours(h); }} heading={false} />
          </fieldset>
        </Card>
      </div>

      {write && (dirty || saved || error) && (
        // Appears once something changed, and sticks to the bottom so the one Save is always in reach.
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap lg:bottom-3 items-center justify-end gap-3 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-card backdrop-blur @4xl:col-span-2">
          {error && <span className="mr-auto text-sm text-danger" role="alert">{error}</span>}
          {saved && !dirty && <span role="status" className="mr-auto text-sm font-semibold text-verified">{t("shop.saved")}</span>}
          {dirty && missing.length > 0 && <span className="mr-auto text-sm text-ink-2">{t("setup.stillNeeded", { items: missing.join(", ") })}</span>}
          {dirty && (
            <Button variant="primary" size="lg" disabled={busy || missing.length > 0} onClick={save}>
              {busy ? t("common.saving") : t("shop.saveChanges")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
