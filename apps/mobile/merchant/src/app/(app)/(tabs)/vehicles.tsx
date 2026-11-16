import { useState } from "react";
import { FlatList, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Bike, Plus } from "lucide-react-native";
import { Button, Card, Chip, ConfirmSheet, EmptyState, ErrorNote, LoadingRows, Screen, Segmented, Text,
  api, bookingStage, errorText, queryClient, rupees, space, useT, type Row } from "@retromobi/mobile-shared";
import { useMerchantShop } from "../../../state/shop";
import { useMerchantQuery } from "../../../state/query";
import { AddVehicleSheet } from "../../../features/fleet/AddVehicleSheet";
import { AvailChip, Listing, useSetup } from "../../../features/fleet/listing";
import { vehicleNow } from "../../../features/fleet/vehicleNow";
import { WalkinSheet } from "../../../features/bookings/WalkinSheet";
import { FleetTimeline } from "../../../features/fleet/FleetTimeline";
import { SetupBoard } from "../../../features/fleet/SetupBoard";
import { useCounterWrite, vehicleLabel } from "../../../features/bookings/common";

export default function Vehicles() {
  const { t, lang } = useT();
  const { shopId, loading, error, can, reloadShops } = useMerchantShop();
  if (loading || error || !shopId || !can("fleet:read")) return <Screen background="canvas">
    {loading ? <LoadingRows label={t("common.loading")} /> : error ? <ErrorNote text={errorText(lang, error)} onRetry={() => void reloadShops()} retryLabel={t("common.retry")} />
      : <EmptyState text={t(shopId ? "common.askOwner" : "common.firstShopBody")} />}
  </Screen>;
  return <VehiclesBody key={shopId} shopId={shopId} />;
}

function VehiclesBody({ shopId }: { shopId: string }) {
  const { t, lang } = useT();
  const router = useRouter();
  const { can } = useMerchantShop();
  const params = useLocalSearchParams<{ view?: string }>();
  const view = params.view === "calendar" || params.view === "setup" ? params.view : "list";
  const [add, setAdd] = useState(false);
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [walkin, setWalkin] = useState<{ id: string; day?: string } | null>(null);
  const [done, setDone] = useState(0);
  const write = useCounterWrite();
  const q = useMerchantQuery<{ vehicles: Row[] }>(`/shops/${shopId}/vehicles`);
  const setup = useSetup(shopId);
  const active = useMerchantQuery<{ bookings: Row[] }>(`/shops/${shopId}/bookings?status=CONFIRMED`, { refetchInterval: 30_000 });
  const staged = (active.data?.bookings ?? []).map((b) => ({ b, stage: bookingStage(b) }));
  const items = q.data?.vehicles ?? [];
  const tally = { FREE: 0, TODAY: 0, OUT: 0, BLOCKED: 0, MISSED: 0 };
  if (active.isSuccess) for (const item of items) {
    const now = vehicleNow(item, staged);
    tally[now.missed ? "MISSED" : now.avail]++;
  }
  const setupById = new Map(setup.data?.vehicles.map((item) => [item.id, item]));
  const ready = setup.data?.vehicles.filter((item) => item.stage === "READY").map((item) => item.id) ?? [];
  const options = [
    ["FREE", "sumFree", "good"], ["TODAY", "sumToday", "attention"], ["OUT", "sumOut", "info"],
    ["BLOCKED", "sumBlocked", "muted"], ["MISSED", "sumMissed", "bad"],
  ] as const;
  const retry = () => { void Promise.all([q.refetch(), setup.refetch(), active.refetch()]); };
  const open = (id: string, tab?: string) => router.push({ pathname: "/vehicle/[id]", params: { id, shopId, tab } });

  const controls = <View style={{ gap: space[3] }}>
    <Text size="xl" weight="bold" accessibilityRole="header">{t("fleet.title")}</Text>
    <Text color="ink2">{t("fleet.subtitle")}</Text>
    {can("fleet:write") && <Button icon={Plus} label={t("fleet.addVehicle")} variant="primary" onPress={() => setAdd(true)} />}
    {!!ready.length && can("fleet:write") && <Button label={t("fleet.showAll")} onPress={() => { setDone(0); setConfirm(ready); }} />}
    <Segmented value={view} onChange={(next) => router.setParams({ view: next })}
      options={[{ value: "list", label: t("fleet.viewList") }, { value: "calendar", label: t("fleet.viewCalendar") }, { value: "setup", label: t("fleet.viewSetup") }]} />
  </View>;
  return <Screen scroll={false} padded={false} background="canvas">
    {view === "setup" ? <SetupBoard shopId={shopId} header={controls} /> : view === "calendar"
    ? <FleetTimeline shopId={shopId} header={controls} onBook={(id, day) => setWalkin({ id, day })} />
    : <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={items} keyExtractor={(item) => String(item.id)} onRefresh={retry}
      refreshing={q.isRefetching || active.isRefetching || setup.isRefetching} contentContainerStyle={{ padding: space[4], gap: space[3] }}
      ListHeaderComponent={<View style={{ gap: space[3] }}>
        {controls}
        {active.isError ? <ErrorNote text={errorText(lang, active.error)} retryLabel={t("common.retry")} onRetry={() => void active.refetch()} />
          : active.isSuccess && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            {options.filter(([key]) => (key !== "BLOCKED" && key !== "MISSED") || tally[key] > 0)
              .map(([key, label, tone]) => <Chip key={key} tone={tone} label={t(`fleet.${label}`, { n: tally[key] })} />)}
          </View>}
        {setup.isError && <ErrorNote text={errorText(lang, setup.error)} retryLabel={t("common.retry")} onRetry={() => void setup.refetch()} />}
      </View>}
      ListEmptyComponent={q.isPending ? <LoadingRows label={t("common.loading")} />
        : q.isError ? <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} />
        : <EmptyState text={t("fleet.empty")} icon={Bike} />}
      renderItem={({ item }) => {
        const id = String(item.id);
        const free = active.isSuccess && vehicleNow(item, staged).avail === "FREE";
        return <Card icon={Bike} title={vehicleLabel(item)}>
          <View style={{ gap: space[2] }}>
            {active.isSuccess && <AvailChip vehicle={item} staged={staged} />}
            {item.amount == null ? <Text color="danger" size="sm">{t("fleet.noPrice")}</Text>
              : <Text color="ink2" size="sm">{t("common.perDay", { amount: rupees(Number(item.amount)) })} · {t("fleet.depositShort", { amount: rupees(Number(item.security_deposit_amount ?? 0)) })}</Text>}
            <Listing item={setupById.get(id)} />
            {free && item.amount != null && can("bookings:write") && <Button label={t("fleet.book")} onPress={() => setWalkin({ id })} />}
            {item.amount == null && can("pricing:write") && <Button label={t("fleet.addPrice")} onPress={() => open(id, "price")} />}
            <Button label={t("fleet.manage")} variant="ghost" onPress={() => open(id)} />
          </View>
        </Card>;
      }} />}
    <AddVehicleSheet open={add} onClose={() => setAdd(false)} onManage={(id) => { setAdd(false); open(id, "photos"); }} />
    <WalkinSheet open={walkin !== null} vehicleId={walkin?.id} startDay={walkin?.day} onClose={() => setWalkin(null)} />
    <ConfirmSheet open={confirm !== null} title={t("fleet.showAll")} cancelLabel={t("common.cancel")} onClose={() => setConfirm(null)}
      body={write.busy ? t("fleet.turningOn", { i: Math.min(done + 1, confirm?.length ?? 0), n: confirm?.length ?? 0 }) : t("fleet.showAllBody", { n: confirm?.length ?? 0 })}
      confirmLabel={t("fleet.yesShow")} busy={write.busy} error={write.error} onConfirm={() => {
        if (!confirm) return;
        const remaining = confirm.filter((id) => ready.includes(id));
        setDone(0);
        void write.run(async () => {
          try {
            for (const id of remaining) {
              await api(`/vehicles/${id}`, { method: "PATCH", body: { status: "ACTIVE" } });
              setDone((n) => n + 1);
            }
            setConfirm(null);
          } finally { void queryClient.invalidateQueries({ queryKey: ["merchant"] }); }
        });
      }} />
  </Screen>;
}
