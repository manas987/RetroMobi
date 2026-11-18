import { useRef, useState } from "react";
import { View } from "react-native";
import { NotificationFeedbackType, notificationAsync } from "expo-haptics";
import { CalendarClock, Video } from "lucide-react-native";
import { Card, Text, colors, errorText, queryClient, space, useT, type Row } from "@retromobi/mobile-shared";

import { counter, counterStyles } from "../../ui/Counter";
import { VehicleThumb } from "../fleet/VehicleThumb";

export function waitingForPickupVideo(booking: Row) {
  return booking.source !== "OFFLINE" && !!booking.id_checked;
}

export function PickupVideoStatus() {
  const { t } = useT();
  return <View style={{ ...counterStyles.row, gap: space[2] }}>
    <Video size={15} color={colors.ink2} strokeWidth={1.8} />
    <Text size="sm" color="ink2" style={{ flexShrink: 1 }}>{t("actions.waitingVideo")}</Text>
  </View>;
}

export function renterName(booking: Row) {
  return String(booking.walkin_name ?? booking.rider_name ?? booking.customer_name ?? "—");
}

export function vehicleLabel(row: Row) {
  return [`${row.make ?? ""} ${row.model ?? ""}`.trim(), String(row.registration_number ?? "")].filter(Boolean).join(" · ");
}

export function BookingSummary({ booking }: { booking: Row }) {
  const { t, date, time } = useT();
  // The vehicle's picture first: at the counter the bike is recognised faster than the plate.
  return <Card style={{ ...counterStyles.panel, padding: space[3] }}>
    <View style={counterStyles.row}>
      <VehicleThumb vehicleId={booking.vehicle_id as string | undefined} vehicle={booking} size={64} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text weight="bold" size="lg" accessibilityLabel={`${t("actions.customer")}: ${renterName(booking)}`} style={{ color: counter.navy }}>{renterName(booking)}</Text>
        <Text size="sm" color="ink2" accessibilityLabel={`${t("actions.vehicle")}: ${vehicleLabel(booking)}`}>{vehicleLabel(booking)}</Text>
        <View style={{ ...counterStyles.row, gap: space[1] }} accessible accessibilityLabel={`${t("actions.return")}: ${date(booking.scheduled_return_at)}, ${time(booking.scheduled_return_at)}`}>
          <CalendarClock size={14} color={colors.ink2} />
          <Text size="sm" weight="medium" tnum>{t("actions.return")}: {date(booking.scheduled_return_at)}, {time(booking.scheduled_return_at)}</Text>
        </View>
      </View>
    </View>
  </Card>;
}

export function useCounterWrite() {
  const { lang } = useT();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(write: () => Promise<void>, options?: { haptics?: boolean; onError?: (err: unknown) => boolean }) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await write();
      void queryClient.invalidateQueries({ queryKey: ["merchant"] });
      if (options?.haptics) void notificationAsync(NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      if (!options?.onError?.(err)) setError(errorText(lang, err));
      if (options?.haptics) void notificationAsync(NotificationFeedbackType.Error).catch(() => {});
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
