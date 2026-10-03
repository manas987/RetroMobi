import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import { presignUpload } from "../../../lib/storage.ts";
import * as pickupService from "./pickupService.ts";

export async function upload(req: Request, res: Response) {
  const key = `inspections/${pathParam(req, "id")}/${Date.now()}`;
  const result = await presignUpload(key, req.body.contentType);
  res.status(200).json(result);
}

export async function confirm(req: Request, res: Response) {
  await pickupService.confirmInspection(pool, {
    userId: req.userId!,
    bookingId: pathParam(req, "id"),
    storageKey: req.body.storageKey,
  });
  res.status(200).json({ confirmed: true });
}
