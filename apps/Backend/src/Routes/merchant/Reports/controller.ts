import type { Request, Response } from "express";
import { pool } from "../../../DB/client.ts";
import { can } from "../../../lib/permissions.ts";
import { pathParam } from "../../../lib/pathParam.ts";
import * as reportsService from "./reportsService.ts";

export async function summary(req: Request, res: Response) {
  const { from, to } = req.validatedQuery as { from: string; to: string };
  const result = await reportsService.shopSummary(
    pool,
    pathParam(req, "shopId"),
    { from, to },
    can(req.shopRole!, "payouts:read"),
  );
  res.status(200).json(result);
}
