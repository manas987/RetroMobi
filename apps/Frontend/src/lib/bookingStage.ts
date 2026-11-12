import { istDay } from "./format";

/**
 * Where a booking is in its life, as a shop owner thinks about it. Derived,
 * never stored: every view (overview counts, board columns, calendar colours,
 * the next-step button) reads this one function so they cannot disagree.
 */
export type BookingStage =
  | "AWAITING_PAYMENT"
  | "UPCOMING"
  | "PICKUP_TODAY"
  | "PICKUP_LATE"
  | "ON_RIDE"
  | "RETURN_TODAY"
  | "OVERDUE"
  | "RETURNED"
  | "DEPOSIT_CLAIMED";

export type Tone = "good" | "attention" | "bad" | "info" | "muted";

/** Optional fields so a raw API row (`Record<string, unknown>`) fits as-is. */
export interface StageInput {
  status?: unknown;
  actual_pickup_at?: unknown;
  actual_return_at?: unknown;
  scheduled_pickup_at?: unknown;
  scheduled_return_at?: unknown;
  deposit_status?: unknown;
}

export function bookingStage(b: StageInput, now: Date = new Date()): BookingStage {
  if (b.status === "HOLD") return "AWAITING_PAYMENT";

  if (b.status === "COMPLETED" || b.actual_return_at) {
    return b.deposit_status === "CLAIMED" || b.deposit_status === "PARTIALLY_DEDUCTED"
      ? "DEPOSIT_CLAIMED"
      : "RETURNED";
  }

  const today = istDay(now);

  if (b.actual_pickup_at) {
    const due = new Date(String(b.scheduled_return_at));
    if (now > due) return "OVERDUE";
    return istDay(due) === today ? "RETURN_TODAY" : "ON_RIDE";
  }

  // Not collected yet. Late only once its whole pickup *day* has gone by: a
  // customer forty minutes behind on the day is still "pickup today".
  const pickupDay = istDay(new Date(String(b.scheduled_pickup_at)));
  if (pickupDay < today) return "PICKUP_LATE";
  if (pickupDay === today) return "PICKUP_TODAY";
  return "UPCOMING";
}

export const STAGE_TONE: Record<BookingStage, Tone> = {
  AWAITING_PAYMENT: "muted",
  UPCOMING: "muted",
  PICKUP_TODAY: "attention",
  PICKUP_LATE: "bad",
  ON_RIDE: "info",
  RETURN_TODAY: "attention",
  OVERDUE: "bad",
  RETURNED: "good",
  DEPOSIT_CLAIMED: "attention",
};

/** The one thing the shop does next. `handover` covers both the identity
 *  check (online) and confirming a walk-in pickup. */
export function nextAction(stage: BookingStage): "handover" | "return" | null {
  if (stage === "PICKUP_TODAY" || stage === "PICKUP_LATE") return "handover";
  if (stage === "ON_RIDE" || stage === "RETURN_TODAY" || stage === "OVERDUE") return "return";
  return null;
}

/** Stages that count as "needs you now" on the overview. */
export function needsAttention(stage: BookingStage): boolean {
  return stage === "PICKUP_LATE" || stage === "OVERDUE";
}
