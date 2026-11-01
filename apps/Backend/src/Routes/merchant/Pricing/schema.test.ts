import { test, expect } from "bun:test";
import { UpsertPricingSchema } from "./schema.ts";

const base = { amount: 50_000, weekendAmount: 60_000, lateFeeAmount: 5_000 };

test("accepts a deposit at the Rs 10,000 cap", () => {
  const parsed = UpsertPricingSchema.safeParse({ ...base, securityDepositAmount: 1_000_000 });
  expect(parsed.success).toBe(true);
});

test("rejects a deposit above the cap the rider cannot fund over UPI", () => {
  const parsed = UpsertPricingSchema.safeParse({ ...base, securityDepositAmount: 1_000_001 });
  expect(parsed.success).toBe(false);
});

test("still rejects a negative deposit", () => {
  const parsed = UpsertPricingSchema.safeParse({ ...base, securityDepositAmount: -1 });
  expect(parsed.success).toBe(false);
});
