import { test, expect } from "bun:test";
import { ListModelsQuerySchema, UpdateModelSchema } from "./schema.ts";

test("a model can be reactivated through PATCH", () => {
  // DELETE /models/:id is a deactivate, so without isActive here the
  // deactivation had no inverse anywhere in the API.
  const parsed = UpdateModelSchema.safeParse({ isActive: true });
  expect(parsed.success).toBe(true);
  expect(parsed.success && parsed.data.isActive).toBe(true);
});

test("PATCH still accepts a partial field set and rejects a blank name", () => {
  expect(UpdateModelSchema.safeParse({ make: "Honda" }).success).toBe(true);
  expect(UpdateModelSchema.safeParse({}).success).toBe(true);
  expect(UpdateModelSchema.safeParse({ make: "" }).success).toBe(false);
});

test("?isActive=false means false", () => {
  // z.coerce.boolean() is JS truthiness, so the string "false" used to coerce
  // to true and this filter selected the opposite of what was asked.
  const parsed = ListModelsQuerySchema.safeParse({ isActive: "false" });
  expect(parsed.success).toBe(true);
  expect(parsed.success && parsed.data.isActive).toBe(false);

  const asTrue = ListModelsQuerySchema.safeParse({ isActive: "true" });
  expect(asTrue.success && asTrue.data.isActive).toBe(true);
});

test("?isActive with a junk value is refused rather than guessed", () => {
  expect(ListModelsQuerySchema.safeParse({ isActive: "yes" }).success).toBe(false);
  expect(ListModelsQuerySchema.safeParse({}).success).toBe(true);
});
