import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import * as pricingService from "./pricingService.ts";

export async function get(req: Request, res: Response) {
  const pricing = await pricingService.getPricing(pool, pathParam(req, "vehicleId"));
  res.status(200).json(pricing);
}

export async function upsert(req: Request, res: Response) {
  const pricing = await pricingService.upsertPricing(
    pool,
    req.merchantUserId!,
    pathParam(req, "vehicleId"),
    req.body,
  );
  res.status(200).json(pricing);
}

export async function listSpecials(req: Request, res: Response) {
  const specials = await pricingService.listSpecials(pool, pathParam(req, "vehicleId"));
  res.status(200).json({ specials });
}

export async function addSpecial(req: Request, res: Response) {
  const special = await pricingService.addSpecial(
    pool,
    req.merchantUserId!,
    pathParam(req, "vehicleId"),
    req.body,
  );
  res.status(201).json(special);
}

export async function removeSpecial(req: Request, res: Response) {
  await pricingService.softDeleteSpecial(pool, req.merchantUserId!, pathParam(req, "specialId"));
  res.status(204).send();
}
