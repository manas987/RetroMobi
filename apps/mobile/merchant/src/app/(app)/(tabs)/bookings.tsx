import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Plus, SlidersHorizontal } from "lucide-react-native";
import { Button, EmptyState, ErrorNote, LoadingRows, Screen, Segmented, SelectOptions, SelectTrigger, Sheet, bookingFilters, errorText, space, useT, type Row } from "@retromobi/mobile-shared";
import { useMerchantShop } from "../../../state/shop";
import { useMerchantQuery } from "../../../state/query";
import { BookingCalendar } from "../../../features/bookings/BookingCalendar";
import { BookingList } from "../../../features/bookings/BookingList";
import { HandoverSheet } from "../../../features/bookings/HandoverSheet";
import { ReturnSheet } from "../../../features/bookings/ReturnSheet";
import { WalkinSheet } from "../../../features/bookings/WalkinSheet";
import { IconAction, PageTitle, SearchField, counterStyles } from "../../../ui/Counter";
import { vehicleLabel } from "../../../features/bookings/common";

export default function Bookings() {
  const { t, lang } = useT();
  const { shopId, loading, error, can, reloadShops } = useMerchantShop();
  if (loading || error || !shopId || !can("bookings:read")) return <Screen background="canvas">
    {loading ? <LoadingRows label={t("common.loading")} /> : error ? <ErrorNote text={errorText(lang, error)} retryLabel={t("common.retry")} onRetry={() => void reloadShops()} />
      : <EmptyState text={t(shopId ? "common.askOwner" : "common.firstShopBody")} />}
  </Screen>;
  return <BookingsBody key={shopId} shopId={shopId} />;
}

function BookingsBody({ shopId }: { shopId: string }) {
  const { t, lang } = useT();
  const { can } = useMerchantShop();
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string; tab?: string }>();
  const view = params.view === "calendar" ? "calendar" : "list";
  const tab = bookingFilters.TAB_KEYS.find((k) => k === params.tab) ?? "today";
  const [filter, setFilter] = useState<"menu" | "source" | "vehicle" | null>(null);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [source, setSource] = useState<bookingFilters.Filters["source"]>("");
  const [vehicleId, setVehicleId] = useState("");
  const [walkin, setWalkin] = useState<{ day?: string } | null>(null);
  const [handover, setHandover] = useState<Row | null>(null);
  const [returning, setReturning] = useState<Row | null>(null);
  const vehicles = useMerchantQuery<{ vehicles: Row[] }>(`/shops/${shopId}/vehicles`);
  useEffect(() => {
    const timer = setTimeout(() => setQ(text), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const selectedVehicle = vehicles.data?.vehicles.find((v) => v.id === vehicleId);
  const filters = { q, source, vehicleId };
  const actions = {
    onHandover: setHandover, onReturn: setReturning,
    onDetails: (b: Row) => router.push({ pathname: "/booking/[id]", params: { id: String(b.id), shopId } }),
  };
  const header = <View style={{ gap: space[3] }}>
    {/* Calendar view books from the selected day's own + button instead. */}
    <PageTitle title={t("bookings.title")} subtitle={t("bookings.subtitle")} action={can("bookings:write") && view !== "calendar" &&
      <IconAction icon={Plus} label={t("bookings.newWalkin")} primary onPress={() => setWalkin({})} />} />
    <Segmented pill value={view} onChange={(value) => router.setParams({ view: value })}
      options={[{ value: "list", label: t("bookings.viewList") }, { value: "calendar", label: t("bookings.viewCalendar") }]} />
    <View style={counterStyles.row}>
      <View style={{ flex: 1 }}>
        <SearchField value={text} accessibilityLabel={t("common.search")} placeholder={t("bookings.searchPlaceholder")}
          autoComplete="off" returnKeyType="search" onChangeText={setText} onSubmitEditing={() => setQ(text)} />
      </View>
      <IconAction icon={SlidersHorizontal} label={t("bookings.filters")} primary={!!source || !!vehicleId} onPress={() => setFilter("menu")} />
    </View>
  </View>;

  return <Screen scroll={false} padded={false} background="canvas">
    {view === "calendar" ? <BookingCalendar shopId={shopId} filters={filters} actions={actions} header={header} onWalkin={(day) => setWalkin({ day })} />
      : <BookingList shopId={shopId} filters={filters} actions={actions} header={header} onWalkin={() => setWalkin({})}
        tab={tab} setTab={(value) => router.setParams({ tab: value })}
        clear={() => { setText(""); setQ(""); setSource(""); setVehicleId(""); }} />}
    <Sheet open={filter !== null} title={t(filter === "source" ? "bookings.filterSource" : filter === "vehicle" ? "bookings.filterVehicle" : "bookings.filters")}
      onClose={() => setFilter(filter === "menu" ? null : "menu")} scroll={filter === "menu"}
      footer={filter === "menu" && <Button variant="primary" label={t("common.done")} onPress={() => setFilter(null)} />}>
      {filter === "source" ? <SelectOptions value={source}
        options={[{ value: "", label: t("bookings.allSources") }, { value: "ONLINE", label: t("common.online") }, { value: "OFFLINE", label: t("common.walkin") }]}
        onChange={(value) => { setSource(value); setFilter("menu"); }} />
        : filter === "vehicle" ? <SelectOptions value={vehicleId}
          options={[{ value: "", label: t("bookings.allVehicles") }, ...(vehicles.data?.vehicles ?? []).map((v) => ({ value: String(v.id), label: vehicleLabel(v) }))]}
          onChange={(value) => { setVehicleId(value); setFilter("menu"); }} />
        : <View style={{ gap: space[2] }}>
          <SelectTrigger compact label={t("bookings.filterSource")} value={t(source === "ONLINE" ? "common.online" : source === "OFFLINE" ? "common.walkin" : "bookings.allSources")}
            onPress={() => setFilter("source")} />
          <SelectTrigger compact label={t("bookings.filterVehicle")} value={selectedVehicle ? vehicleLabel(selectedVehicle) : t("bookings.allVehicles")}
            onPress={() => setFilter("vehicle")} />
          {vehicles.isError && <ErrorNote text={errorText(lang, vehicles.error)} retryLabel={t("common.retry")} onRetry={() => void vehicles.refetch()} />}
        </View>}
    </Sheet>
    <WalkinSheet open={walkin !== null} startDay={walkin?.day} onClose={() => setWalkin(null)} />
    <HandoverSheet booking={handover} onClose={() => setHandover(null)} />
    <ReturnSheet booking={returning} onClose={() => setReturning(null)} />
  </Screen>;
}
