import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import { cashfreeClient } from "../../../providers/cashfree.ts";
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
    cashfreeClient,
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
