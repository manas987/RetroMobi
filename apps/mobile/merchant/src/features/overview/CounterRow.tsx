import { View } from "react-native";
import { Button, Card, Chip, STAGE_TONE, Text, nextAction, space, useT, type BookingStage, type Row } from "@retromobi/mobile-shared";
import { useMerchantShop } from "../../state/shop";
import { renterName, vehicleLabel } from "../bookings/common";

export function CounterRow({ b, stage, onHandover, onReturn, onDetails }: {
  b: Row; stage: BookingStage; onHandover: (booking: Row) => void; onReturn: (booking: Row) => void; onDetails?: () => void;
}) {
  const { t, date, time } = useT();
  const { can } = useMerchantShop();
  const action = nextAction(stage);
  const going = ["UPCOMING", "PICKUP_TODAY", "PICKUP_LATE", "AWAITING_PAYMENT"].includes(stage);
  const at = going ? b.scheduled_pickup_at : b.actual_return_at ?? b.scheduled_return_at;
  return <Card>
    <View style={{ gap: space[2] }}>
      <Text weight="bold">{renterName(b)}</Text>
      <Text size="sm" color="ink2">{vehicleLabel(b)}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
        <Chip tone={STAGE_TONE[stage]} label={t(`status.stage_${stage}`)} />
        {b.source === "OFFLINE" && <Chip tone="muted" label={t("common.walkin")} />}
      </View>
      <Text size="sm" color="ink2">{t(going ? "overview.pickupAt" : "overview.returnAt", { time: `${date(at)}, ${time(at)}` })}</Text>
      {action === "handover" && can("bookings:write") && <Button label={t(b.source === "OFFLINE" ? "actions.handoverWalkin" : b.identity_checked_at ? "actions.waitingVideo" : "actions.handover")}
        variant={b.identity_checked_at ? "secondary" : "primary"} onPress={() => onHandover(b)} />}
      {action === "return" && can("bookings:return") && <Button label={t("actions.markReturned")} variant="primary" onPress={() => onReturn(b)} />}
      {onDetails && <Button label={t("actions.details")} variant="ghost" onPress={onDetails} />}
    </View>
  </Card>;
}
