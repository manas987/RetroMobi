import type { Request, Response } from "express";
import { pool } from "../../../DB/client.ts";
import { pathParam } from "../../../lib/pathParam.ts";
import * as activityService from "./activityService.ts";

export async function list(req: Request, res: Response) {
  const query = req.validatedQuery as Parameters<typeof activityService.listActivity>[2];
  res.status(200).json(await activityService.listActivity(pool, pathParam(req, "shopId"), query));
}
