import { z } from "zod";

export const CreatePaymentIntentSchema = z.object({
  groupId: z.string().uuid(),
});

// Cashfree's webhook body. Field names match their documented payload shape;
// the exact envelope isn't pinned by backend.md/implementation.md and hasn't been
// checked against a live Cashfree sandbox -- verify before going live.
export const PaymentWebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    order: z.object({ order_id: z.string() }),
    payment: z.object({ cf_payment_id: z.union([z.string(), z.number()]) }).optional(),
  }),
});
