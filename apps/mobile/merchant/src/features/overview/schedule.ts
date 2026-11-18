import { bookingStage, type BookingStage } from "../../../../shared/src/lib/bookingStage";
import type { Row } from "@retromobi/mobile-shared";

export function overviewSchedule(bookings: Row[], now: Date) {
  const staged = bookings.map((b) => ({ b, stage: bookingStage(b, now) }));
  const due = ({ b, stage }: { b: Row; stage: BookingStage }) =>
    new Date(String(stage.startsWith("PICKUP") || stage === "UPCOMING" ? b.scheduled_pickup_at : b.scheduled_return_at)).getTime();
  const ordered = [...staged].sort((a, b) => due(a) - due(b));
  return {
    staged,
    overdue: ordered.filter(({ stage }) => stage === "PICKUP_LATE" || stage === "OVERDUE"),
    today: ordered.filter(({ stage }) => stage === "PICKUP_TODAY" || stage === "RETURN_TODAY"),
    upcoming: ordered.filter(({ stage }) => stage === "UPCOMING").slice(0, 12),
  };
}
