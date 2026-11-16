import { useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Bike } from "lucide-react-native";
import {
  ApiError, Button, Card, Chip, ConfirmSheet, EmptyState, ErrorNote, LoadingRows, Screen, Tabs, Text,
  STAGE_TONE as BOOKING_TONE, api, bookingStage, errorText, space, useT, type Permission, type Row, type TKey,
} from "@retromobi/mobile-shared";
import { useMerchantShop } from "../../../state/shop";
import { useMerchantQuery } from "../../../state/query";
import { renterName, useCounterWrite, vehicleLabel } from "../../../features/bookings/common";
import { WalkinSheet } from "../../../features/bookings/WalkinSheet";
import { AvailChip, Listing, useSetup } from "../../../features/fleet/listing";
import { vehicleNow, type Staged } from "../../../features/fleet/vehicleNow";
import { AccessoriesTab } from "../../../features/fleet/tabs/AccessoriesTab";
import { CalendarTab } from "../../../features/fleet/tabs/CalendarTab";
import { PapersTab } from "../../../features/fleet/tabs/PapersTab";
import { PhotosTab } from "../../../features/fleet/tabs/PhotosTab";
import { PriceTab } from "../../../features/fleet/tabs/PriceTab";
import { RegistrationTab } from "../../../features/fleet/tabs/RegistrationTab";
import { ListingChecklist } from "../../../features/fleet/SetupBoard";
import { Fields, Pending } from "../../../features/fleet/tabs/Fields";

const TABS = [
  ["overview", "fleet.tabOverview", "fleet:read"], ["price", "fleet.tabPrice", "pricing:read"],
  ["photos", "fleet.tabPhotos", "fleet:read"], ["documents", "fleet.tabPapers", "fleet:read"],
  ["calendar", "fleet.tabCalendar", "fleet:read"], ["accessories", "fleet.tabAccessories", "fleet:read"],
  ["registration", "fleet.tabRegistration", "fleet:read"],
] as const satisfies readonly (readonly [string, TKey, Permission])[];

export default function VehiclePage() {
  const { t, lang } = useT();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { shopId, shops, loading, setShopId, can } = useMerchantShop();
  const q = useMerchantQuery<Row>(id && !loading ? `/vehicles/${encodeURIComponent(id)}` : null);
  const vehicle = q.data;
  const branch = vehicle && shops.find((shop) => shop.id === vehicle.shop_id);
  return <Screen background="canvas" edges={["left", "right", "bottom"]} contentStyle={{ gap: space[3] }}
    refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
    <Stack.Screen options={{ title: vehicle ? vehicleLabel(vehicle) : t("nav.fleet") }} />
    {loading || q.isPending ? <LoadingRows label={t("common.loading")} />
      : q.isError ? (q.error instanceof ApiError && q.error.status === 404
        ? <EmptyState icon={Bike} text={t("fleet.notFound")} action={<Button label={t("fleet.allVehicles")} onPress={() => router.replace("/vehicles")} />} />
        : <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} />)
      : branch && String(branch.id) !== shopId ? <Card title={String(branch.name)}>
        <Button label={t("common.change")} accessibilityLabel={`${t("common.change")} · ${branch.name}`} onPress={() => setShopId(String(branch.id))} />
      </Card> : vehicle && branch && shopId && can("fleet:read") ? <VehicleBody key={id} id={id} shopId={shopId} vehicle={vehicle} />
      : <ErrorNote text={t("common.askOwner")} />}
  </Screen>;
}

function VehicleBody({ id, shopId, vehicle }: { id: string; shopId: string; vehicle: Row }) {
  const { t, date, time } = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { can } = useMerchantShop();
  const [walkin, setWalkin] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const remove = useCounterWrite();
  const setup = useSetup(shopId);
  const sv = setup.data?.vehicles.find((row) => row.id === id);
  const query = useMerchantQuery<{ bookings: Row[] }>(`/shops/${shopId}/bookings?status=CONFIRMED`, { refetchInterval: 30_000 });
  const staged = (query.data?.bookings ?? []).map((b): Staged => ({ b, stage: bookingStage(b) }));
  const tabs = TABS.filter(([, , permission]) => can(permission));
  const tab = tabs.find(([key]) => key === params.tab)?.[0] ?? "overview";
  const openTab = (key: string) => router.setParams({ tab: key });
  const bookable = query.isSuccess && vehicleNow(vehicle, staged).avail === "FREE" && sv?.priceSet && can("bookings:write");
  const next = staged.filter(({ b }) => b.vehicle_id === id)
    .sort((a, b) => String(a.b.scheduled_pickup_at).localeCompare(String(b.b.scheduled_pickup_at))).slice(0, 3);

  return <>
    <Card title={vehicleLabel(vehicle)} icon={Bike}>
      <Fields>
        {query.isSuccess ? <AvailChip vehicle={vehicle} staged={staged} /> : <Pending error={query.error} retry={query.refetch} />}
        <Listing item={sv} />
        {bookable && <Button variant="primary" label={t("fleet.book")} onPress={() => setWalkin(true)} />}
      </Fields>
    </Card>
    <Tabs value={tab} onChange={openTab} options={tabs.map(([value, label]) => ({ value, label: t(label) }))} />
    {tab === "overview" && <>
      <Card title={t("fleet.rightNow")}>
        <Fields>
          {query.isSuccess && !next.length && <Text color="ink2">{t("fleet.noUpcoming")}</Text>}
          {next.map(({ b, stage }) => <Fields key={String(b.id)}>
            <Button label={renterName(b)} onPress={() => router.push({ pathname: "/booking/[id]", params: { id: String(b.id), shopId } })} />
            <Text size="sm" color="ink2">{date(b.scheduled_pickup_at)} · {time(b.scheduled_pickup_at)}</Text>
            <Chip tone={BOOKING_TONE[stage]} label={t(`status.stage_${stage}`)} />
          </Fields>)}
        </Fields>
      </Card>
      <Card title={t("fleet.listingTitle")}>
        <Fields>
          {!setup.isSuccess ? <Pending error={setup.error} retry={setup.refetch} />
            : sv && <ListingChecklist item={sv} openTab={openTab} />}
        </Fields>
      </Card>
      {can("fleet:write") && <Card title={t("fleet.removeTitle")}>
        <Fields>
          <Text color="danger">{t("fleet.removeWarn")}</Text>
          <Button label={t("fleet.removeVehicle")} onPress={() => setConfirm(true)} />
        </Fields>
      </Card>}
    </>}
    {tab === "price" && <PriceTab id={id} />}
    {tab === "photos" && <PhotosTab id={id} />}
    {tab === "documents" && <PapersTab id={id} setup={sv} electric={vehicle.fuel_type === "ELECTRIC"} />}
    {tab === "calendar" && <CalendarTab id={id} shopId={shopId} staged={staged} />}
    {tab === "accessories" && <AccessoriesTab id={id} />}
    {tab === "registration" && <RegistrationTab id={id} />}
    <WalkinSheet open={walkin} vehicleId={id} onClose={() => setWalkin(false)} />
    <ConfirmSheet open={confirm} title={t("fleet.removeVehicle")} body={t("fleet.removeBody", { plate: String(vehicle.registration_number ?? "") })}
      danger confirmLabel={t("fleet.removeYes")} cancelLabel={t("common.cancel")} busy={remove.busy} error={remove.error} onClose={() => setConfirm(false)}
      onConfirm={() => void remove.run(async () => { await api(`/vehicles/${id}`, { method: "DELETE" }); setConfirm(false); router.replace("/vehicles"); })} />
  </>;
}
