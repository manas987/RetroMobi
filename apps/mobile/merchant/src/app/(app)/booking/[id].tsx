import { useState } from "react";
import { Linking, View } from "react-native";
import { Bike, CircleHelp, KeyRound, Phone, Undo2, Wallet } from "lucide-react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Button, Card, ErrorNote, LoadingRows, Screen, STAGE_TONE, Text, bookingStage, can, colors, errorText,
  nextAction, phoneLabel, radius, rupees, space, useT, useToast, type Row, type Tone,
} from "@retromobi/mobile-shared";
import { CounterRowLink, StatusBadge, counter, counterStyles } from "../../../ui/Counter";
import { VehicleThumb } from "../../../features/fleet/VehicleThumb";
import { useMerchantShop } from "../../../state/shop";
import { useMerchantQuery } from "../../../state/query";
import { PickupVideoStatus, renterName, vehicleLabel, waitingForPickupVideo } from "../../../features/bookings/common";
import { HandoverSheet } from "../../../features/bookings/HandoverSheet";
import { ReturnSheet } from "../../../features/bookings/ReturnSheet";

const depositTone: Record<string, Tone> = { HELD: "info", RELEASED: "good", CLAIMED: "attention", PARTIALLY_DEDUCTED: "attention" };
function Item({ label, value }: { label: string; value: string }) {
  return <View style={{ ...counterStyles.row, alignItems: "baseline", paddingVertical: space[1] }}>
    <Text size="sm" color="ink2" style={{ flex: 1 }}>{label}</Text>
    <Text weight="medium" tnum style={{ flex: 1.3, textAlign: "right" }}>{value}</Text>
  </View>;
}

/** One stop on the pickup → return line: a dot, the label, the planned time, and what actually happened. */
function Stop({ label, value, actual, last }: { label: string; value: string; actual?: string; last?: boolean }) {
  return <View style={{ flexDirection: "row", gap: space[3] }}>
    <View style={{ alignItems: "center", width: 14 }} accessible={false}>
      <View style={{ width: 14, height: 14, borderRadius: radius.full, marginTop: 4, backgroundColor: last ? counter.navy : colors.amber, borderWidth: 2, borderColor: last ? counter.navy : colors.amberEdge }} />
      {!last && <View style={{ flex: 1, width: 2, backgroundColor: colors.line, marginVertical: 2 }} />}
    </View>
    <View style={{ flex: 1, gap: 2, paddingBottom: last ? 0 : space[4] }}>
      <Text size="sm" color="ink2">{label}</Text>
      <Text weight="bold" size="md" tnum>{value}</Text>
      {actual && <Text size="sm" color="verified" tnum>{actual}</Text>}
    </View>
  </View>;
}

export default function BookingDetail() {
  const { t, lang, tMaybe, date, time } = useT();
  const toast = useToast();
  const router = useRouter();
  const { id, shopId: requestedShop } = useLocalSearchParams<{ id: string; shopId?: string }>();
  const { shopId, shops, loading, error, reloadShops } = useMerchantShop();
  const branch = requestedShop && shops.some((shop) => shop.id === requestedShop) ? requestedShop : requestedShop ? null : shopId;
  const role = shops.find((shop) => shop.id === branch)?.role;
  const canOperate = role === "OWNER" || role === "MANAGER" || role === "STAFF";
  const q = useMerchantQuery<Row>(branch && id && canOperate ? `/shops/${branch}/bookings/${encodeURIComponent(id)}` : null);
  const [operation, setOperation] = useState<"handover" | "return" | null>(null);
  const b = q.data;
  const stage = b ? bookingStage(b) : null;
  const action = stage ? nextAction(stage) : null;
  const walkin = b?.source === "OFFLINE";
  const phone = String((walkin ? b?.walkin_phone : b?.customer_phone) ?? "");
  const depositStatus = String(b?.deposit_status ?? "");
  const at = (value: unknown) => `${date(value, { weekday: "short", day: "numeric", month: "short" })}, ${time(value)}`;
  const handover = !!b && action === "handover" && !waitingForPickupVideo(b) && can(String(role), "bookings:write");
  const returning = !!b && action === "return" && can(String(role), "bookings:return");
  // The one thing to do next sits pinned at the bottom, always in reach of a thumb.
  const footer = handover ? <Button variant="primary" size="lg" full icon={KeyRound} label={t(walkin ? "actions.handoverWalkin" : "actions.handover")} onPress={() => setOperation("handover")} />
    : returning ? <Button variant="dark" size="lg" full icon={Undo2} label={t("actions.markReturned")} onPress={() => setOperation("return")} /> : undefined;
  return <Screen background="canvas" edges={["bottom", "left", "right"]} contentStyle={{ gap: space[3] }} footer={footer}
    onRefresh={branch ? () => void q.refetch() : undefined} refreshing={q.isRefetching}>
    <Stack.Screen options={{ title: t("bookings.sheetTitle"), headerTitle: "" }} />
    {error ? <ErrorNote text={errorText(lang, error)} retryLabel={t("common.retry")} onRetry={() => void reloadShops()} />
      : loading ? <LoadingRows label={t("common.loading")} />
      : !branch || !canOperate ? <ErrorNote text={t("common.askOwner")} />
      : q.isPending ? <LoadingRows label={t("common.loading")} />
      : q.isError ? <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} />
      : b && stage && <>
        <Card style={{ ...counterStyles.panel, gap: space[3] }}>
          <View style={counterStyles.row}>
            <VehicleThumb vehicleId={b.vehicle_id as string | undefined} vehicle={b} size={72} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text size="xxl" weight="bold" accessibilityRole="header" style={{ color: counter.navy }}>{renterName(b)}</Text>
              <Text size="sm" color="ink2" tnum>{t("bookings.code", { code: String(b.id).slice(0, 8).toUpperCase() })}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], alignItems: "center" }}>
            <StatusBadge tone={STAGE_TONE[stage]} label={t(`status.stage_${stage}`)} />
            <StatusBadge tone={walkin ? "muted" : "info"} icon={walkin ? Bike : undefined} label={t(walkin ? "common.walkin" : "common.online")} />
          </View>
        </Card>
        <Card style={counterStyles.panel} title={t("actions.customer")}>
          <View style={{ gap: space[2] }}>
            {!!phone && <CounterRowLink icon={Phone} title={phoneLabel(phone)} detail={t("actions.phone")}
              onPress={() => { void Linking.openURL(`tel:${phone.replace(/[^+0-9]/g, "")}`).catch(() => toast(t("common.couldntLoad"))); }} />}
            {b.walkin_dl_number != null && <Item label={t("actions.licenceNumber")} value={String(b.walkin_dl_number)} />}
            {b.vehicle_id ? <CounterRowLink icon={Bike} title={vehicleLabel(b)} detail={t("actions.vehicle")}
              onPress={() => router.push({ pathname: "/vehicle/[id]", params: { id: String(b.vehicle_id), shopId: branch } })} />
              : <Item label={t("actions.vehicle")} value={vehicleLabel(b)} />}
          </View>
        </Card>
        <Card style={counterStyles.panel} title={t("bookings.sectionTimes")}>
          <View>
            <Stop label={t("bookings.plannedPickup")} value={at(b.scheduled_pickup_at)}
              actual={b.actual_pickup_at != null ? `${t("bookings.pickedUpAt")}: ${at(b.actual_pickup_at)}` : undefined} />
            <Stop last label={t("bookings.plannedReturn")} value={at(b.scheduled_return_at)}
              actual={b.actual_return_at != null ? `${t("bookings.returnedAt")}: ${at(b.actual_return_at)}` : undefined} />
          </View>
        </Card>
        <Card style={counterStyles.panel} title={t("bookings.sectionMoney")}>
          <View style={{ gap: space[2] }}>
            <Item label={t("actions.rent")} value={rupees(Number(b.rental_amount ?? 0))} />
            {b.deposit_amount != null && <Item label={t("actions.deposit")} value={rupees(Number(b.deposit_amount))} />}
            {!walkin && depositStatus && <StatusBadge icon={Wallet} tone={depositTone[depositStatus] ?? "muted"} label={tMaybe(`status.deposit_${depositStatus}`) ?? depositStatus} />}
            {walkin && <Text size="sm" color="ink2">{t("bookings.cashNote")}</Text>}
          </View>
        </Card>
        {action === "handover" && waitingForPickupVideo(b) && <PickupVideoStatus />}
        <View style={counterStyles.group}><CounterRowLink icon={CircleHelp} title={t("bookings.help")} onPress={() => router.push({ pathname: "/support", params: { booking: String(b.id) } })} /></View>
      </>}
    <HandoverSheet booking={operation === "handover" ? b ?? null : null} onClose={() => setOperation(null)} />
    <ReturnSheet booking={operation === "return" ? b ?? null : null} onClose={() => setOperation(null)} />
  </Screen>;
}
