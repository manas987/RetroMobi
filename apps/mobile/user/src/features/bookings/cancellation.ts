// Mirrors refundForCancellation in the backend. The server settles using the time of cancellation.
export function cancellationEstimate(pickupAt: number, now: number, rental: number, deposit: number, paid: number) {
  const hoursUntilPickup = (pickupAt - now) / 3_600_000;
  const penaltyPercent = hoursUntilPickup > 24 ? 10 : hoursUntilPickup >= 2 ? 50 : 100;
  const refund = rental - Math.round(rental * penaltyPercent / 100) + deposit;
  return { refund, kept: Math.max(0, paid - refund) };
}
