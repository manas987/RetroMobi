import type { Request, Response } from "express";
import { pool } from "../../../DB/client.ts";
import { presignDownload } from "../../../lib/storage.ts";
import { pathParam } from "../../../lib/pathParam.ts";
import { getVehicleDetail, searchVehicles, VehicleNotFoundError } from "./searchService.ts";
import { VehicleDetailParamsSchema, VehicleDetailWindowSchema, type SearchQuerySchema } from "./schema.ts";
import type { z } from "zod";

export async function search(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof SearchQuerySchema>;
  const result = await searchVehicles(pool, query);
  res.status(200).json(result);
}

// A plain 1-hour signed GET, not folded into the search response itself: many
// search rows share one model's image_key, so resolving it lazily and once
// per model on the client avoids re-signing the same key N times per page.
export async function modelImage(req: Request, res: Response) {
  const { rows } = await pool.query(`select image_key from vehicle_models where id = $1`, [pathParam(req, "modelId")]);
  const imageKey = rows[0]?.image_key as string | null | undefined;
  if (!imageKey) {
    res.status(404).json({ error: "no_image" });
    return;
  }
  const url = await presignDownload(imageKey, 3600);
  res.status(200).json({ url });
}

export async function detail(req: Request, res: Response) {
  const params = VehicleDetailParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_request", issues: params.error.issues });
    return;
  }

  const window = req.query.pickupAt !== undefined || req.query.returnAt !== undefined
    ? VehicleDetailWindowSchema.safeParse(req.query)
    : undefined;
  if (window && !window.success) {
    res.status(400).json({ error: "invalid_rental_window", issues: window.error.issues });
    return;
  }

  try {
    const { photoKeys, ...result } = await getVehicleDetail(pool, params.data.vehicleId, window?.data);
    const photos = await Promise.allSettled(photoKeys.map((key) => presignDownload(key)));
    const photoUrls = photos.flatMap((photo) =>
      photo.status === "fulfilled" && !photo.value.startsWith("https://dev-fallback.local/") ? [photo.value] : [],
    );
    res.status(200).json({ ...result, photoUrls });
  } catch (err) {
    if (err instanceof VehicleNotFoundError) {
      res.status(404).json({ error: "vehicle_not_found" });
      return;
    }
    throw err;
  }
}
