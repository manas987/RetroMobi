import { useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Bike } from "lucide-react";
import { PortalApiError, type Row } from "../../../lib/portal";
import type { Permission } from "../../../lib/permissions";
import { useT, type TKey } from "../../../i18n";
import { Toggle } from "../../../components/Toggle";
import { MerchantLayout, useMerchantShop } from "../Layout";
import { useMerchantQuery, useUrlParam } from "../query";
import { WalkinSheet } from "../bookingActions";
import { Button, Chip, EmptyState, ErrorNote, LoadingRows, PageHeader, Tabs } from "../ui/ui";
import { AvailChip } from "./VehicleCard";
import { STAGE_TONE, useListingActions, useSetup } from "./SetupBoard";
import { useStagedBookings, vehicleNow } from "./vehicleNow";
import { OverviewTab } from "./tabs/OverviewTab";
import { PriceTab } from "./tabs/PriceTab";
import { PhotosTab } from "./tabs/PhotosTab";
import { PapersTab } from "./tabs/PapersTab";
import { CalendarTab } from "./tabs/CalendarTab";
import { AccessoriesTab } from "./tabs/AccessoriesTab";
import { RegistrationTab } from "./tabs/RegistrationTab";

const TABS = [
  { key: "overview", label: "fleet.tabOverview", needs: "fleet:read" },
  { key: "price", label: "fleet.tabPrice", needs: "pricing:read" },
  { key: "photos", label: "fleet.tabPhotos", needs: "fleet:read" },
  { key: "documents", label: "fleet.tabPapers", needs: "fleet:read" },
  { key: "calendar", label: "fleet.tabCalendar", needs: "fleet:read" },
  { key: "accessories", label: "fleet.tabAccessories", needs: "fleet:read" },
  { key: "registration", label: "fleet.tabRegistration", needs: "fleet:read" },
] as const satisfies readonly { key: string; label: TKey; needs: Permission }[];

const KEYS = TABS.map((x) => x.key);

function VehicleBody() {
  const { vehicleId = "" } = useParams<{ vehicleId: string }>();
  const { token, can } = useMerchantShop();
  const { t } = useT();
  const q = useMerchantQuery<Row>(`/vehicles/${vehicleId}`, token);
  const setup = useSetup();
  const { staged } = useStagedBookings();
  const act = useListingActions();
  const [rawTab, setTab] = useUrlParam("tab", KEYS, "overview");
  const [walkin, setWalkin] = useState(false);

  if (q.isPending) return <LoadingRows rows={4} />;
  if (q.isError) {
    const gone = q.error instanceof PortalApiError && q.error.status === 404;
    return gone ? (
      <EmptyState icon={Bike} text={t("fleet.notFound")}
        action={<Link href="/merchant/fleet" className="inline-flex min-h-11 items-center rounded-2xl bg-amber px-4 text-sm font-semibold text-on-amber">{t("fleet.allVehicles")}</Link>} />
    ) : <ErrorNote onRetry={() => q.refetch()} />;
  }

  const v = q.data;
  const sv = setup.data?.vehicles.find((x) => x.id === vehicleId);
  const stage = sv?.stage;
  const tabs = TABS.filter((x) => can(x.needs));
  // A link to a tab this role can't see lands on Overview.
  const tab = tabs.some((x) => x.key === rawTab) ? rawTab : "overview";
  const canBook = vehicleNow(vehicleId, staged).avail === "FREE" && sv?.priceSet && can("bookings:write");
  const toggle = stage === "READY" || stage === "SHOWING";

  return (
    <div>
      <Link href="/merchant/fleet" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden />{t("fleet.allVehicles")}
      </Link>
      <PageHeader
        title={`${String(v.make ?? "")} ${String(v.model ?? "")}`}
        subtitle={<span className="tnum">{String(v.registration_number ?? "")}</span>}
        actions={
          <>
            <AvailChip id={vehicleId} staged={staged} />
            {/* The switch's own label already says it; don't repeat it as a chip. */}
            {stage && !(toggle && can("fleet:write")) && <Chip tone={STAGE_TONE[stage]}>{t(`fleet.stage_${stage}` as const)}</Chip>}
            {toggle && can("fleet:write") && (
              <span className="flex min-h-11 items-center gap-2 text-sm text-ink-2">
                <Toggle checked={stage === "SHOWING"} disabled={act.busy} onChange={(on) => act.setActive(vehicleId, on)} label={t("fleet.toggleLabel", { vehicle: String(v.registration_number) })} />
                {t(stage === "SHOWING" ? "fleet.listingOn" : "fleet.listingReady")}
              </span>
            )}
            {canBook && <Button variant="primary" onClick={() => setWalkin(true)}>{t("fleet.book")}</Button>}
          </>
        }
      />
      {act.error && <div className="mb-4"><ErrorNote text={act.error} /></div>}

      <Tabs value={tab} onChange={setTab} tabs={tabs.map((x) => ({ key: x.key, label: t(x.label) }))} />

      {tab === "overview" && <OverviewTab v={v} sv={sv} />}
      {tab === "price" && <PriceTab id={vehicleId} />}
      {tab === "photos" && <PhotosTab id={vehicleId} />}
      {tab === "documents" && <PapersTab id={vehicleId} />}
      {tab === "calendar" && <CalendarTab id={vehicleId} />}
      {tab === "accessories" && <AccessoriesTab id={vehicleId} />}
      {tab === "registration" && <RegistrationTab id={vehicleId} />}

      <WalkinSheet open={walkin} vehicleId={vehicleId} onClose={() => setWalkin(false)} />
    </div>
  );
}

export function MerchantVehicle() {
  return (
    <MerchantLayout>
      <VehicleBody />
    </MerchantLayout>
  );
}
