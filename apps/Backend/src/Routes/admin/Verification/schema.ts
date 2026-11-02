import { z } from "zod";

export const VerifiableTypeSchema = z.enum([
  "SHOP",
  "VEHICLE",
  "VEHICLE_DOCUMENT",
  "MERCHANT_DOCUMENT",
  "SHOP_LICENCE",
  "RIDER_VERIFICATION",
]);

export const QueueQuerySchema = z.object({
  type: VerifiableTypeSchema,
  // Lets an admin review what was already decided. Omitted means PENDING, so
  // the queue's default behaviour is unchanged. ACTIVE is here because a
  // licence goes PENDING -> ACTIVE rather than PENDING -> VERIFIED.
  // MANUAL_REVIEW_REQUIRED and the other session states join the list for
  // RIDER_VERIFICATION, whose "pending" is not called PENDING.
  status: z
    .enum([
      "PENDING",
      "VERIFIED",
      "ACTIVE",
      "REJECTED",
      "EXPIRED",
      "MANUAL_REVIEW_REQUIRED",
      "PHOTO_PENDING",
      "DOCUMENT_FAILED",
      "DOCUMENT_PENDING",
      "CONSENT_PENDING",
      "REVOKED",
    ])
    .optional(),
});

export const DocumentParamsSchema = z.object({
  type: VerifiableTypeSchema,
  id: z.string().uuid(),
});

export const DecisionSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
  note: z.string().optional(),
});

export const LicenceDecisionSchema = z.object({
  status: z.enum(["ACTIVE", "REJECTED"]),
  note: z.string().optional(),
});

/**
 * A reason is mandatory, and 10 characters is enough to stop "ok" while still
 * letting a reviewer be brief. Manual approval is the one path that can
 * override the automated evidence, so it has to justify itself in the audit
 * trail.
 */
export const RiderReviewSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
  reason: z.string().min(10).max(500),
});
