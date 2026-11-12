import type { Request, Response } from "express";
import { pool } from "../../../DB/client.ts";
import { pathParam } from "../../../lib/pathParam.ts";
import * as setupService from "./setupService.ts";

export async function setup(req: Request, res: Response) {
  res.status(200).json(await setupService.getShopSetup(pool, pathParam(req, "shopId")));
}
