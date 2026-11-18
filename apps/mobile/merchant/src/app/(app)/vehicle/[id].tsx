import { useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { BadgeCheck, Bike, CalendarClock, CalendarDays, CalendarPlus, Camera, FileText, HardHat, IndianRupee, LayoutGrid, Trash2, type LucideIcon } from "lucide-react-native";
import {
  ApiError, Button, Card, ConfirmSheet, EmptyState, ErrorNote, LoadingRows, Screen, Text,
  colors, radius, STAGE_TONE as BOOKING_TONE, api, bookingStage, errorText, space, useT, type Permission, type Row, type TKey,
} from "@retromobi/mobile-shared";
import { CounterRowLink, StatusBadge, counter, counterStyles } from "../../../ui/Counter";
import { VehicleThumb } from "../../../features/fleet/VehicleThumb";
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
const TAB_ICON: Record<(typeof TABS)[number][0], LucideIcon> = {
  overview: LayoutGrid, price: IndianRupee, photos: Camera, documents: FileText, calendar: CalendarDays, accessories: HardHat, registration: BadgeCheck,
};

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
    <Stack.Screen options={{ title: vehicle ? [vehicle.make, vehicle.model].filter(Boolean).join(" ") || t("nav.fleet") : t("nav.fleet"), headerTitle: "" }} />
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
    <VehicleThumb vehicleId={id} vehicle={vehicle} height={220} />
    <Card style={{ ...counterStyles.panel, gap: space[2] }}>
      <Text size="xxl" weight="bold" accessibilityRole="header" style={{ color: counter.navy }}>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicleLabel(vehicle)}</Text>
      <Text color="ink2" tnum>{String(vehicle.registration_number ?? "")}</Text>
      {query.isSuccess ? <AvailChip vehicle={vehicle} staged={staged} /> : <Pending error={query.error} retry={query.refetch} />}
      <Listing item={sv} />
      {bookable && <Button variant="primary" size="lg" icon={CalendarPlus} label={t("fleet.book")} onPress={() => setWalkin(true)} />}
    </Card>
    <Text size="lg" weight="bold" accessibilityRole="header">{t("fleet.manage")}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }} accessibilityRole="tablist">
      {tabs.map(([key, label]) => {
        const Icon = TAB_ICON[key];
        const on = key === tab;
        return <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => openTab(key)}
          style={({ pressed }) => [{ width: "31.5%", minHeight: 84, padding: space[2], gap: space[1], alignItems: "center", justifyContent: "center",
            borderRadius: radius.card, backgroundColor: on ? counter.navy : colors.surface, borderWidth: 1, borderColor: on ? counter.navy : colors.line,
            opacity: pressed ? 0.75 : 1 }]}>
          <Icon size={22} color={on ? colors.amber : counter.navy} />
          <Text size="sm" weight="bold" center numberOfLines={2} color={on ? "surface" : "ink"}>{t(label)}</Text>
        </Pressable>;
      })}
    </View>
    {tab === "overview" && <>
      <Card style={counterStyles.panel} title={t("fleet.rightNow")}>
        <Fields>
          {query.isSuccess && !next.length && <Text color="ink2">{t("fleet.noUpcoming")}</Text>}
          {next.map(({ b, stage }) => <Fields key={String(b.id)}>
            <CounterRowLink icon={CalendarClock} title={renterName(b)}
              detail={`${date(b.scheduled_pickup_at)} · ${time(b.scheduled_pickup_at)}`}
              onPress={() => router.push({ pathname: "/booking/[id]", params: { id: String(b.id), shopId } })} />
            <StatusBadge tone={BOOKING_TONE[stage]} label={t(`status.stage_${stage}`)} />
          </Fields>)}
        </Fields>
      </Card>
      <Card style={counterStyles.panel} title={t("fleet.listingTitle")}>
        <Fields>
          {!setup.isSuccess ? <Pending error={setup.error} retry={setup.refetch} />
            : sv && <ListingChecklist item={sv} openTab={openTab} listing={false} />}
        </Fields>
      </Card>
      {can("fleet:write") && <View style={counterStyles.group}>
        <CounterRowLink icon={Trash2} danger title={t("fleet.removeVehicle")} detail={t("fleet.removeWarn")} onPress={() => setConfirm(true)} />
      </View>}
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
