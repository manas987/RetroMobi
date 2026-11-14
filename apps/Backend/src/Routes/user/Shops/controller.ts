import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import { presignDownload } from "../../../lib/storage.ts";
import * as shopProfileService from "./shopProfileService.ts";

export async function profile(req: Request, res: Response) {
  const { photoKeys, ...shop } = await shopProfileService.getShopProfile(pool, pathParam(req, "shopId"));
  // Same as the vehicle detail: a key that can't be signed is dropped, not sent broken.
  const photos = await Promise.allSettled(photoKeys.map((key) => presignDownload(key)));
  const photoUrls = photos.flatMap((photo) =>
    photo.status === "fulfilled" && !photo.value.startsWith("https://dev-fallback.local/") ? [photo.value] : [],
  );
  res.status(200).json({ ...shop, photoUrls });
}
