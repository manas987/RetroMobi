import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight, KeyRound, Undo2 } from "lucide-react-native";
import { Button, Card, STAGE_TONE, Text, nextAction, radius, space, tone, useT, type BookingStage, type Row } from "@retromobi/mobile-shared";
import { useMerchantShop } from "../../state/shop";
import { counter, counterStyles } from "../../ui/Counter";
import { renterName, vehicleLabel, waitingForPickupVideo } from "../bookings/common";
import { VehicleThumb } from "../fleet/VehicleThumb";

export function CounterRow({ b, stage, onHandover, onReturn, onDetails }: {
  b: Row; stage: BookingStage; onHandover: (booking: Row) => void; onReturn: (booking: Row) => void; onDetails?: () => void;
}) {
  const { t, date, time } = useT();
  const { can } = useMerchantShop();
  const action = nextAction(stage);
  const going = ["UPCOMING", "PICKUP_TODAY", "PICKUP_LATE", "AWAITING_PAYMENT"].includes(stage);
  const at = going ? b.scheduled_pickup_at : b.actual_return_at ?? b.scheduled_return_at;
  const waiting = action === "handover" && waitingForPickupVideo(b);
  const handover = action === "handover" && !waiting && can("bookings:write");
  const returning = action === "return" && can("bookings:return");
  const status = waiting ? t("actions.pickupVideoPending") : t(`status.stage_${stage}`);
  const color = tone[STAGE_TONE[stage]];
  const row = <>
    <VehicleThumb vehicleId={b.vehicle_id as string | undefined} vehicle={b} size={56} />
    <View style={styles.body}>
      <Text weight="bold" size="md">{renterName(b)}</Text>
      <Text size="sm" color="ink2">{vehicleLabel(b)}</Text>
      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: color.dot }]} />
        <Text size="xs" weight="medium" style={{ color: color.fg, flexShrink: 1 }}>
          {status}{b.source === "OFFLINE" ? ` · ${t("common.walkin")}` : ""}
        </Text>
      </View>
    </View>
    <View accessible accessibilityLabel={t(going ? "overview.pickupAt" : "overview.returnAt", { time: `${date(at)}, ${time(at)}` })}
      style={styles.time}>
      <Text weight="bold" size="sm" tnum>{time(at)}</Text>
      <Text size="xs" color="ink2">{date(at, { day: "numeric", month: "short" })}</Text>
    </View>
    {onDetails && <ChevronRight size={16} color={counter.navy} strokeWidth={1.8} style={styles.arrow} />}
  </>;
  return <Card style={{ ...counterStyles.panel, padding: 0, gap: 0 }}>
    {onDetails ? <Pressable accessibilityRole="button" accessibilityHint={t("actions.details")} onPress={onDetails}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>{row}</Pressable>
      : <View style={styles.row}>{row}</View>}
    {(handover || returning) && <View style={styles.action}>
      {handover && <Button label={t(b.source === "OFFLINE" ? "actions.handoverWalkin" : "actions.handover")}
        variant="primary" icon={KeyRound} onPress={() => onHandover(b)} />}
      {returning && <Button label={t("actions.markReturned")} variant="dark" icon={Undo2} onPress={() => onReturn(b)} />}
    </View>}
  </Card>;
}

const styles = StyleSheet.create({
  row: { ...counterStyles.row, alignItems: "center", gap: space[3], padding: space[3], minHeight: 48, borderRadius: radius.card },
  time: { alignItems: "flex-end", flexShrink: 0 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  status: { flexDirection: "row", alignItems: "center", gap: space[1], marginTop: space[1] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  arrow: { alignSelf: "center" },
  pressed: { backgroundColor: counter.pale },
  action: { paddingHorizontal: space[3], paddingBottom: space[3] },
});
