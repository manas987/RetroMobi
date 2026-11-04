import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import {
  cashfreePayoutClient,
  verifyPayoutWebhookSignature,
} from "../../../providers/cashfreePayout.ts";
import * as payoutsService from "./payoutsService.ts";

export async function getAccount(req: Request, res: Response) {
  const account = await payoutsService.getPayoutAccount(pool, req.merchantUserId!);
  res.status(200).json(account);
}

export async function upsertAccount(req: Request, res: Response) {
  const account = await payoutsService.upsertPayoutAccount(
    pool,
    req.merchantUserId!,
    req.body,
    cashfreePayoutClient,
  );
  res.status(200).json(account);
}

export async function listMine(req: Request, res: Response) {
  const query = req.validatedQuery as { status?: string; from?: Date; to?: Date };
  const payouts = await payoutsService.listMyPayouts(pool, req.merchantUserId!, query);
  res.status(200).json({ payouts });
}

export async function listShop(req: Request, res: Response) {
  const query = req.validatedQuery as { status?: string; from?: Date; to?: Date };
  const payouts = await payoutsService.listShopPayouts(pool, pathParam(req, "shopId"), query);
  res.status(200).json({ payouts });
}

const PAYOUT_EVENT_TYPES: Record<string, "TRANSFER_SUCCESS" | "TRANSFER_FAILED"> = {
  TRANSFER_SUCCESS: "TRANSFER_SUCCESS",
  TRANSFER_FAILED: "TRANSFER_FAILED",
  // Cashfree's dashboard names events with a _WEBHOOK suffix while the payload
  // reference shows the bare name. Both are accepted rather than guessed at;
  // confirm against the first real delivery and delete the loser.
  TRANSFER_SUCCESS_WEBHOOK: "TRANSFER_SUCCESS",
  TRANSFER_FAILED_WEBHOOK: "TRANSFER_FAILED",
};

// req.body is a raw Buffer -- mounted ahead of express.json() in src/index.ts
// so the signature check runs against the exact bytes Cashfree signed.
export async function webhook(req: Request, res: Response) {
  const rawBody = (req.body as Buffer).toString("utf8");
  const signature = req.header("x-webhook-signature") ?? "";
  const timestamp = req.header("x-webhook-timestamp") ?? "";

  if (!verifyPayoutWebhookSignature(rawBody, signature, timestamp)) {
    res.status(400).json({ error: "invalid_signature" });
    return;
  }

  const payload = JSON.parse(rawBody) as {
    type?: string;
    event_id?: string;
    data?: { transfer?: { transfer_id?: string } };
  };

  const type = payload.type ? PAYOUT_EVENT_TYPES[payload.type] : undefined;
  const transferId = payload.data?.transfer?.transfer_id;
  if (!type || !transferId) {
    // Not an event we act on, or not one we can place. Acknowledged so Cashfree
    // stops retrying, but logged -- an unrecognised type is a doc change, not
    // noise.
    console.log(`[cashfree-payout] ignoring webhook type=${String(payload.type)}`);
    res.status(200).json({ processed: false });
    return;
  }

  const result = await payoutsService.handlePayoutWebhook(pool, {
    providerEventId: payload.event_id ?? `${type}_${transferId}`,
    type,
    transferId,
    payload,
  });
  res.status(200).json(result);
}
