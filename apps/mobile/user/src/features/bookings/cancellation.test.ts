import { expect, test } from "bun:test";
import { cancellationEstimate } from "./cancellation";

test("estimates the refund and the net amount kept at the policy cutoffs", () => {
  const hour = 3_600_000;
  const estimate = (pickupAt: number) => cancellationEstimate(pickupAt, 0, 10_005, 20_000, 31_005);
  expect(estimate(24 * hour + 1)).toEqual({ refund: 29_004, kept: 2_001 });
  expect(estimate(24 * hour)).toEqual({ refund: 25_002, kept: 6_003 });
  expect(estimate(2 * hour)).toEqual({ refund: 25_002, kept: 6_003 });
  expect(estimate(2 * hour - 1)).toEqual({ refund: 20_000, kept: 11_005 });
});
