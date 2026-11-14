import { useState } from "react";
import { Link, Redirect, useSearchParams } from "wouter";
import { Rocket, Store } from "lucide-react";
import { portalFetch, type Row } from "../../lib/portal";
import { useT, type TKey } from "../../i18n";
import { Toggle } from "../../components/Toggle";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery, useUrlParam } from "./query";
import { Button, Card, Chip, EmptyState, ErrorNote, LoadingRows, PageHeader, Tabs } from "./ui/ui";
import { VERIFY_TONE } from "./shop/BranchCard";
import { BranchForm } from "./shop/BranchSheet";
import { HoursForm } from "./shop/HoursSheet";
import { ShopPapersTab } from "./shop/ShopPapersTab";
import { PhotosTab } from "./fleet/tabs/PhotosTab";

export function MerchantShop() {
  return (
    <MerchantLayout>
      <ShopBody />
    </MerchantLayout>
  );
}

/** Old `/merchant/shop?tab=…` links now live on their own pages. */
const MOVED: Record<string, string> = { branches: "/merchant/shops", documents: "/merchant/papers", vehicles: "/merchant/all-vehicles" };
const TABS = ["details", "photos", "hours", "papers"] as const;

function ShopBody() {
  const [params] = useSearchParams();
  const moved = MOVED[params.get("tab") ?? ""];
  return moved ? <Redirect to={moved} replace /> : <ShopPage />;
}

/** The shop picked in the sidebar switcher, with its own tabs, like a vehicle's page. */
function ShopPage() {
  const { t, lang } = useT();
  const { token, shopId, shops, can, reloadShops } = useMerchantShop();
  const invalidate = useInvalidateMerchant();
  const [tab, setTab] = useUrlParam("tab", TABS, "details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const shop = shops.find((s) => String(s.id) === shopId);

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
  // The state is locked while there are other shops: they must all be in one state.
  const others = shops.filter((s) => String(s.id) !== shopId);

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
            {write && verify !== "VERIFIED" && (
              <Link href="/merchant/setup"><Button variant="primary" icon={Rocket}>{t("shop.getListed")}</Button></Link>
            )}
          </>
        }
      />
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <Tabs
        value={tab}
        onChange={(k) => { setSaved(false); setTab(k); }}
        tabs={[
          { key: "details", label: t("shop.tabDetails") },
          { key: "photos", label: t("shop.tabPhotos") },
          { key: "hours", label: t("shop.tabHours") },
          { key: "papers", label: t("shop.tabShopPapers") },
        ]}
      />
      {/* Keyed on the shop so switching shop in the sidebar resets every form. */}
      {saved && <p role="status" className="mb-4 max-w-2xl rounded-2xl bg-verified-soft px-4 py-3 text-sm font-semibold text-verified">{t("shop.saved")}</p>}
      <div key={shopId}>
        {tab === "details" && (
          write ? (
            <Card className="max-w-2xl">
              <BranchForm shop={shop} token={token} reloadShops={reloadShops} onClose={() => setSaved(true)}
                lockedState={others.length > 0 ? String(shop.state) : undefined} />
            </Card>
          ) : <ReadOnly shop={shop} />
        )}
        {tab === "photos" && <PhotosTab id={shopId} base={`/shops/${shopId}/media`} canWrite={write} mediaType={false} />}
        {tab === "hours" && <HoursTab shopId={shopId} onSaved={() => setSaved(true)} />}
        {tab === "papers" && <ShopPapersTab shopId={shopId} />}
      </div>
    </div>
  );
}

function ReadOnly({ shop }: { shop: Row }) {
  const { t } = useT();
  const rows: [string, unknown][] = [
    [t("common.shopName"), shop.name],
    [t("setup.shopPhone"), shop.phone],
    [t("common.address"), [shop.address_line1, shop.city, shop.state, shop.pincode].filter(Boolean).join(", ")],
    [t("shop.landmark"), shop.landmark],
  ];
  return (
    <Card className="max-w-2xl">
      <dl className="flex flex-col gap-3">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><dt className="text-xs text-ink-3">{k}</dt><dd className="text-base text-ink">{String(v)}</dd></div>
        ))}
      </dl>
    </Card>
  );
}

function HoursTab({ shopId, onSaved }: { shopId: string; onSaved: () => void }) {
  const { token, can } = useMerchantShop();
  const { t } = useT();
  const q = useMerchantQuery<Row>(`/shops/${shopId}`, token);
  if (q.isPending) return <LoadingRows />;
  if (q.isError) return <ErrorNote onRetry={() => q.refetch()} />;
  if (!can("shop:write")) return <Card><p className="text-base text-ink-2">{t("shop.hoursReadOnly")}</p></Card>;
  return <Card className="max-w-2xl"><HoursForm shop={q.data} shopId={shopId} token={token} onClose={onSaved} /></Card>;
}
