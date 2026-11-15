import { useRef, useState } from "react";
import { View } from "react-native";
import { NotificationFeedbackType, notificationAsync } from "expo-haptics";
import { Card, Text, errorText, queryClient, space, useT, type Row } from "@retromobi/mobile-shared";

export function renterName(booking: Row) {
  return String(booking.walkin_name ?? booking.rider_name ?? booking.customer_name ?? "—");
}

export function vehicleLabel(row: Row) {
  return [`${row.make ?? ""} ${row.model ?? ""}`.trim(), String(row.registration_number ?? "")].filter(Boolean).join(" · ");
}

export function BookingSummary({ booking }: { booking: Row }) {
  const { t, date, time } = useT();
  return <Card>
    <View style={{ gap: space[2] }}>
      {[
        [t("actions.customer"), renterName(booking)],
        [t("actions.vehicle"), vehicleLabel(booking)],
        [t("actions.return"), `${date(booking.scheduled_return_at)}, ${time(booking.scheduled_return_at)}`],
      ].map(([label, value]) => <View key={label}>
        <Text size="sm" color="ink2">{label}</Text>
        <Text weight="medium">{value}</Text>
      </View>)}
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
