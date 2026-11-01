import { test, expect } from "bun:test";
import { DocumentParamsSchema, QueueQuerySchema } from "./schema.ts";

test("the queue defaults to pending by omitting status", () => {
  const parsed = QueueQuerySchema.safeParse({ type: "VEHICLE_DOCUMENT" });
  expect(parsed.success).toBe(true);
  expect(parsed.success && parsed.data.status).toBeUndefined();
});

test("decided items can be reviewed, including a licence's ACTIVE", () => {
  // A licence goes PENDING -> ACTIVE, not PENDING -> VERIFIED, so ACTIVE has
  // to be a legal filter or approved licences are unreviewable.
  expect(QueueQuerySchema.safeParse({ type: "SHOP_LICENCE", status: "ACTIVE" }).success).toBe(true);
  expect(QueueQuerySchema.safeParse({ type: "VEHICLE", status: "REJECTED" }).success).toBe(true);
  expect(QueueQuerySchema.safeParse({ type: "VEHICLE", status: "BOGUS" }).success).toBe(false);
});

test("the document route only accepts a known type and a real uuid", () => {
  // `type` picks the table name to query, so an unknown value must never
  // reach the service.
  expect(
    DocumentParamsSchema.safeParse({
      type: "VEHICLE_DOCUMENT",
      id: "00000000-0000-0000-0000-000000000000",
    }).success,
  ).toBe(true);

  expect(
    DocumentParamsSchema.safeParse({ type: "vehicle_documents", id: "00000000-0000-0000-0000-000000000000" })
      .success,
  ).toBe(false);
  expect(DocumentParamsSchema.safeParse({ type: "VEHICLE_DOCUMENT", id: "not-a-uuid" }).success).toBe(false);
});
