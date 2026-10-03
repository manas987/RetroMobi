import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import { cashfreeClient } from "../../../providers/cashfree.ts";
import * as bookingsService from "./bookingsService.ts";

export async function createHold(req: Request, res: Response) {
  const result = await bookingsService.createHold(pool, {
    userId: req.userId!,
    ...req.body,
  });
  res.status(201).json(result);
}

export async function cancelBooking(req: Request, res: Response) {
  const result = await bookingsService.cancelBooking(
    pool,
    { userId: req.userId!, bookingId: pathParam(req, "id") },
    cashfreeClient,
  );
  res.status(200).json(result);
}

export async function extendBooking(req: Request, res: Response) {
  const result = await bookingsService.extendBooking(pool, {
    userId: req.userId!,
    bookingId: pathParam(req, "id"),
    newReturnAt: req.body.newReturnAt,
  });
  res.status(200).json(result);
}
