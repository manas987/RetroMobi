import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import { presignUpload, storedContentType } from "../../../lib/storage.ts";
import * as pickupService from "./pickupService.ts";

export async function upload(req: Request, res: Response) {
  const key = `inspections/${pathParam(req, "id")}/${Date.now()}`;
  const result = await presignUpload(key, req.body.contentType);
  res.status(200).json(result);
}

export async function confirm(req: Request, res: Response) {
  const bookingId = pathParam(req, "id");
  const storageKey = req.body.storageKey as string;
  const prefix = `inspections/${bookingId}/`;
  if (!storageKey.startsWith(prefix) || !/^\d{13}$/.test(storageKey.slice(prefix.length))) {
    res.status(400).json({ error: "invalid_pickup_video", message: "Choose and upload a new pickup video." });
    return;
  }
  const contentType = await storedContentType(storageKey);
  if ((contentType !== undefined || process.env.NODE_ENV === "production") && !contentType?.toLowerCase().startsWith("video/")) {
    res.status(400).json({ error: "invalid_pickup_video", message: "We couldn’t find the uploaded video. Upload it again to confirm pickup." });
    return;
  }
  await pickupService.confirmInspection(pool, {
    userId: req.userId!,
    bookingId,
    storageKey,
  });
  res.status(200).json({ confirmed: true });
}
