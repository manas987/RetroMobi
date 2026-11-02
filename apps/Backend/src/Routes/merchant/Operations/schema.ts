import { z } from "zod";
import { phoneSchema } from "../../../lib/phone";

export const ListBookingsQuerySchema = z.object({
  status: z.enum(["HOLD", "CONFIRMED", "COMPLETED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const CreateWalkinSchema = z.object({
  vehicleId: z.string().uuid(),
  walkinName: z.string().min(1),
  walkinPhone: phoneSchema,
  walkinDlNumber: z.string().min(1),
  pickupAt: z.coerce.date(),
  returnAt: z.coerce.date(),
});

export const ReturnSchema = z.object({
  claim: z.boolean(),
  reason: z.string().optional(),
  amount: z.number().int().nonnegative().optional(),
});

/**
 * The handover identity check. Both booleans are required to be true by the
 * service, not by this schema -- a false is a meaningful answer that gets
 * audited as a refused handover, so it has to reach the service rather than
 * being rejected as invalid input.
 */
export const IdentityCheckSchema = z.object({
  photoMatched: z.boolean(),
  physicalDlSeen: z.boolean(),
  // Read off the physical card and compared with the stored mask.
  dlNumberLast4: z.string().length(4),
  notes: z.string().max(500).optional(),
});
