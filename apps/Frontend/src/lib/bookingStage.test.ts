import { describe, expect, test } from "bun:test";
import { bookingStage, nextAction } from "./bookingStage";

// Noon IST on 10 March.
const NOW = new Date("2031-03-10T12:00:00+05:30");
const at = (s: string) => new Date(s).toISOString();

const base = {
  status: "CONFIRMED",
  scheduled_pickup_at: at("2031-03-12T10:00:00+05:30"),
  scheduled_return_at: at("2031-03-13T10:00:00+05:30"),
};

describe("bookingStage", () => {
  test("HOLD is a customer still at checkout", () => {
    expect(bookingStage({ ...base, status: "HOLD" }, NOW)).toBe("AWAITING_PAYMENT");
  });

  test("future pickup is upcoming, today's is pickup today even if the hour has passed", () => {
    expect(bookingStage(base, NOW)).toBe("UPCOMING");
    expect(bookingStage({ ...base, scheduled_pickup_at: at("2031-03-10T09:00:00+05:30") }, NOW)).toBe("PICKUP_TODAY");
  });

  test("a pickup from a previous IST day that never happened is late", () => {
    expect(bookingStage({ ...base, scheduled_pickup_at: at("2031-03-09T18:00:00+05:30") }, NOW)).toBe("PICKUP_LATE");
  });

  test("IST, not UTC: 00:30 IST on the 10th is today, though it is the 9th in UTC", () => {
    expect(bookingStage({ ...base, scheduled_pickup_at: at("2031-03-10T00:30:00+05:30") }, NOW)).toBe("PICKUP_TODAY");
  });

  test("collected: on ride, due back today, or overdue", () => {
    const out = { ...base, actual_pickup_at: at("2031-03-09T10:00:00+05:30") };
    expect(bookingStage(out, NOW)).toBe("ON_RIDE");
    expect(bookingStage({ ...out, scheduled_return_at: at("2031-03-10T18:00:00+05:30") }, NOW)).toBe("RETURN_TODAY");
    expect(bookingStage({ ...out, scheduled_return_at: at("2031-03-10T11:00:00+05:30") }, NOW)).toBe("OVERDUE");
  });

  test("returned, and returned with the deposit claimed", () => {
    expect(bookingStage({ ...base, status: "COMPLETED" }, NOW)).toBe("RETURNED");
    expect(bookingStage({ ...base, status: "COMPLETED", deposit_status: "CLAIMED" }, NOW)).toBe("DEPOSIT_CLAIMED");
  });

  test("next action follows the stage", () => {
    expect(nextAction("PICKUP_LATE")).toBe("handover");
    expect(nextAction("OVERDUE")).toBe("return");
    expect(nextAction("UPCOMING")).toBeNull();
  });
});
