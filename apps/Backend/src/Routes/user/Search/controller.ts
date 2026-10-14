import type { Request, Response } from "express";
import { pool } from "../../../DB/client.ts";
import { getVehicleDetail, searchVehicles, VehicleNotFoundError } from "./searchService.ts";
import { VehicleDetailParamsSchema, type SearchQuerySchema } from "./schema.ts";
import type { z } from "zod";

export async function search(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof SearchQuerySchema>;
  const result = await searchVehicles(pool, query);
  res.status(200).json(result);
}

export async function detail(req: Request, res: Response) {
  const params = VehicleDetailParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "invalid_request", issues: params.error.issues });
    return;
  }

  try {
    const result = await getVehicleDetail(pool, params.data.vehicleId);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof VehicleNotFoundError) {
      res.status(404).json({ error: "vehicle_not_found" });
      return;
    }
    throw err;
  }
}
