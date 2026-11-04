import type { Request, Response } from "express";
import { pool } from "../../../DB/client.ts";
import { cashfreeClient } from "../../../providers/cashfree.ts";
import * as paymentsService from "./paymentsService.ts";

export async function status(req: Request, res: Response) {
  const result = await paymentsService.getPaymentStatus(
    pool,
    { groupId: String(req.params.groupId), userId: req.userId! },
    cashfreeClient,
  );
  res.json(result);
}

export async function createIntent(req: Request, res: Response) {
  const result = await paymentsService.createPaymentIntent(
    pool,
    { groupId: req.body.groupId, userId: req.userId! },
    cashfreeClient,
  );
  res.status(201).json(result);
}

// Both spellings, on purpose. The _WEBHOOK suffixed names are what the Cashfree
// dashboard calls the subscriptions; the payload reference documents the bare
// `type` values. Which one a real delivery actually carries has never been
// observed, and guessing wrong means silently ignoring every payment
// confirmation. Confirm against the first sandbox delivery and delete the
// loser -- see docs/payments-checklist.md, blocker 1.
const EVENT_TYPE_MAP: Record<string, "PAYMENT_SUCCESS" | "PAYMENT_FAILED" | "REFUND_SUCCESS"> = {
  PAYMENT_SUCCESS_WEBHOOK: "PAYMENT_SUCCESS",
  PAYMENT_FAILED_WEBHOOK: "PAYMENT_FAILED",
  PAYMENT_USER_DROPPED_WEBHOOK: "PAYMENT_FAILED",
  REFUND_STATUS_WEBHOOK: "REFUND_SUCCESS",
  PAYMENT_SUCCESS: "PAYMENT_SUCCESS",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  PAYMENT_USER_DROPPED: "PAYMENT_FAILED",
  REFUND_STATUS: "REFUND_SUCCESS",
};

// req.body here is a raw Buffer -- this route is mounted ahead of the global
// express.json() parser (see src/index.ts) specifically so the signature check
// below runs against the exact bytes Cashfree signed.
export async function webhook(req: Request, res: Response) {
  const rawBody = (req.body as Buffer).toString("utf8");
  const signature = req.header("x-webhook-signature") ?? "";
  const timestamp = req.header("x-webhook-timestamp") ?? "";

  if (!cashfreeClient.verifyWebhookSignature(rawBody, signature, timestamp)) {
    res.status(400).json({ error: "invalid_signature" });
    return;
  }

  const payload = JSON.parse(rawBody) as {
    type: string;
    event_id?: string;
    data: { order: { order_id: string } };
  };

  const type = EVENT_TYPE_MAP[payload.type];
  if (!type) {
    // Not one of the three events we act on -- acknowledge so Cashfree stops
    // retrying, but log it: an unrecognised type is a vendor change, not noise.
    console.log(`[cashfree] ignoring webhook type=${String(payload.type)}`);
    res.status(200).json({ processed: false });
    return;
  }

  const result = await paymentsService.handlePaymentWebhook(
    pool,
    {
      providerEventId: payload.event_id ?? `${payload.type}_${payload.data.order.order_id}`,
      type,
      orderId: payload.data.order.order_id,
      payload,
    },
    cashfreeClient,
  );
  res.status(200).json(result);
}
