import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import * as shopProfileService from "./shopProfileService.ts";

export async function profile(req: Request, res: Response) {
  const shop = await shopProfileService.getShopProfile(pool, pathParam(req, "shopId"));
  res.status(200).json(shop);
}
