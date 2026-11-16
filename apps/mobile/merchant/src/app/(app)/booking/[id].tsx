import { useState } from "react";
import { Linking, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Button, Card, Chip, ErrorNote, LoadingRows, Screen, STAGE_TONE, Text, bookingStage, errorText,
  nextAction, phoneLabel, rupees, space, useT, useToast, type Row, type Tone,
} from "@retromobi/mobile-shared";
import { useMerchantShop } from "../../../state/shop";
import { useMerchantQuery } from "../../../state/query";
import { renterName, vehicleLabel } from "../../../features/bookings/common";
import { HandoverSheet } from "../../../features/bookings/HandoverSheet";
import { ReturnSheet } from "../../../features/bookings/ReturnSheet";

const depositTone: Record<string, Tone> = { HELD: "info", RELEASED: "good", CLAIMED: "attention", PARTIALLY_DEDUCTED: "attention" };
function Item({ label, value }: { label: string; value: string }) {
  return <View><Text size="sm" color="ink2">{label}</Text><Text weight="medium">{value}</Text></View>;
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
  return <Screen background="canvas" edges={["bottom", "left", "right"]} contentStyle={{ gap: space[3] }}
    onRefresh={branch ? () => void q.refetch() : undefined} refreshing={q.isRefetching}>
    <Stack.Screen options={{ title: b ? renterName(b) : t("bookings.sheetTitle") }} />
    {error ? <ErrorNote text={errorText(lang, error)} retryLabel={t("common.retry")} onRetry={() => void reloadShops()} />
      : loading ? <LoadingRows label={t("common.loading")} />
      : !branch || !canOperate ? <ErrorNote text={t("common.askOwner")} />
      : q.isPending ? <LoadingRows label={t("common.loading")} />
      : q.isError ? <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} />
      : b && stage && <>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], alignItems: "center" }}>
          <Chip tone={STAGE_TONE[stage]} label={t(`status.stage_${stage}`)} />
          <Chip tone={walkin ? "muted" : "info"} label={t(walkin ? "common.walkin" : "common.online")} />
          <Text size="sm" color="ink2">{t("bookings.code", { code: String(b.id).slice(0, 8).toUpperCase() })}</Text>
        </View>
        <Card title={t("actions.customer")}>
          <View style={{ gap: space[2] }}>
            <Text weight="bold">{renterName(b)}</Text>
            {!!phone && <Button label={phoneLabel(phone)} accessibilityLabel={`${t("actions.phone")} ${phoneLabel(phone)}`}
              onPress={() => { void Linking.openURL(`tel:${phone.replace(/[^+0-9]/g, "")}`).catch(() => toast(t("common.couldntLoad"))); }} />}
            {b.walkin_dl_number != null && <Item label={t("actions.licenceNumber")} value={String(b.walkin_dl_number)} />}
            {b.vehicle_id ? <Button label={vehicleLabel(b)} accessibilityLabel={`${t("actions.vehicle")} · ${vehicleLabel(b)}`}
              onPress={() => router.push({ pathname: "/vehicle/[id]", params: { id: String(b.vehicle_id), shopId: branch } })} />
              : <Item label={t("actions.vehicle")} value={vehicleLabel(b)} />}
          </View>
        </Card>
        <Card title={t("bookings.sectionTimes")}>
          <View style={{ gap: space[2] }}>
            <Item label={t("bookings.plannedPickup")} value={at(b.scheduled_pickup_at)} />
            {b.actual_pickup_at != null && <Item label={t("bookings.pickedUpAt")} value={at(b.actual_pickup_at)} />}
            <Item label={t("bookings.plannedReturn")} value={at(b.scheduled_return_at)} />
            {b.actual_return_at != null && <Item label={t("bookings.returnedAt")} value={at(b.actual_return_at)} />}
          </View>
        </Card>
        <Card title={t("bookings.sectionMoney")}>
          <View style={{ gap: space[2] }}>
            <Item label={t("actions.rent")} value={rupees(Number(b.rental_amount ?? 0))} />
            {b.deposit_amount != null && <Item label={t("actions.deposit")} value={rupees(Number(b.deposit_amount))} />}
            {!walkin && depositStatus && <Chip tone={depositTone[depositStatus] ?? "muted"} label={tMaybe(`status.deposit_${depositStatus}`) ?? depositStatus} />}
            {walkin && <Text size="sm" color="ink2">{t("bookings.cashNote")}</Text>}
          </View>
        </Card>
        {action === "handover" && (!walkin && b.id_checked
          ? <Chip tone="info" label={t("actions.waitingVideo")} />
          : <Button variant="primary" label={t(walkin ? "actions.handoverWalkin" : "actions.handover")} onPress={() => setOperation("handover")} />)}
        {action === "return" && <Button variant="dark" label={t("actions.markReturned")} onPress={() => setOperation("return")} />}
        <Button variant="ghost" label={t("bookings.help")} onPress={() => router.push({ pathname: "/chats", params: { booking: String(b.id) } })} />
      </>}
    <HandoverSheet booking={operation === "handover" ? b ?? null : null} onClose={() => setOperation(null)} />
    <ReturnSheet booking={operation === "return" ? b ?? null : null} onClose={() => setOperation(null)} />
  </Screen>;
}
