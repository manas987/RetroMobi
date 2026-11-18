import { expect, test } from "bun:test";
import { paymentOutcome, type PaymentStatus } from "./payment";

const hold: PaymentStatus = {
  orderStatus: null, paymentStatus: null, bookingStatus: "HOLD", totalAmount: 1,
  holdExpiresAt: "2026-11-15T10:00:00Z", items: [],
  totals: { rentalAmount: 1, platformFee: 0, discountAmount: 0, taxAmount: 0, securityDepositAmount: 0 },
};

test("a valid hold is payable before starting, but a pending payment isn't", () => {
  expect(paymentOutcome(hold, 0)).toBe("ready");
  expect(paymentOutcome({ ...hold, orderStatus: "ACTIVE", paymentStatus: "PENDING" }, 0)).toBe("pending");
});

test("an expired hold cannot be paid; a confirmed booking wins over the hold clock", () => {
  const later = Date.parse(hold.holdExpiresAt!) + 1;
  expect(paymentOutcome(hold, later)).toBe("expired");
  expect(paymentOutcome({ ...hold, bookingStatus: "CONFIRMED" }, later)).toBe("confirmed");
});

test("late money alone never confirms a booking", () => {
  expect(paymentOutcome({ ...hold, paymentStatus: "SUCCEEDED" }, Date.parse(hold.holdExpiresAt!) + 1)).toBe("paidWithoutBooking");
});
