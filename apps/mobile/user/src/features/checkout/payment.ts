export type PaymentStatus = {
  orderStatus: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | "TERMINATION_REQUESTED" | null;
  paymentStatus: string | null;
  bookingStatus: string | null;
  totalAmount: number | null;
  holdExpiresAt: string | null;
  totals: { rentalAmount: number; platformFee: number; taxAmount: number; discountAmount: number; securityDepositAmount: number };
  items: { make: string; model: string; shopName: string; riderName: string | null }[];
};

export type PaymentIntent = { orderId: string; paymentSessionId: string; mode: "sandbox" | "production" };

export function paymentOutcome(status: PaymentStatus, now: number) {
  if (status.bookingStatus === "CONFIRMED") return "confirmed";
  if (status.paymentStatus === "SUCCEEDED") return "paidWithoutBooking";
  if (status.bookingStatus !== "HOLD" || (status.holdExpiresAt && Date.parse(status.holdExpiresAt) <= now) ||
    status.orderStatus === "EXPIRED" || status.orderStatus === "TERMINATED") return "expired";
  if (status.paymentStatus === "FAILED") return "failed";
  if (status.paymentStatus || status.orderStatus) return "pending";
  return "ready";
}
