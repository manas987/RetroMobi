import type { Request, Response } from "express";
import { pool } from "../../../DB/client.ts";
import { searchVehicles } from "./searchService.ts";
import type { SearchQuerySchema } from "./schema.ts";
import type { z } from "zod";

export async function search(req: Request, res: Response) {
  const query = req.validatedQuery as z.infer<typeof SearchQuerySchema>;
  const result = await searchVehicles(pool, query);
  res.status(200).json(result);
}
