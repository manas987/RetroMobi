import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import * as shopsService from "./shopsService.ts";

export async function list(req: Request, res: Response) {
  const shops = await shopsService.listShops(pool, req.merchantUserId!);
  res.status(200).json({ shops });
}

export async function create(req: Request, res: Response) {
  const shop = await shopsService.createShop(pool, req.merchantUserId!, req.body);
  res.status(201).json(shop);
}

export async function get(req: Request, res: Response) {
  const shop = await shopsService.getShop(pool, pathParam(req, "shopId"));
  res.status(200).json(shop);
}

export async function update(req: Request, res: Response) {
  const shop = await shopsService.updateShop(
    pool,
    req.merchantUserId!,
    pathParam(req, "shopId"),
    req.body,
  );
  res.status(200).json(shop);
}

export async function remove(req: Request, res: Response) {
  await shopsService.softDeleteShop(pool, req.merchantUserId!, pathParam(req, "shopId"));
  res.status(204).send();
}

export async function submitVerification(req: Request, res: Response) {
  const result = await shopsService.submitForVerification(
    pool,
    req.merchantUserId!,
    pathParam(req, "shopId"),
  );
  res.status(200).json(result);
}

export async function setHours(req: Request, res: Response) {
  const shop = await shopsService.setShopHours(
    pool,
    req.merchantUserId!,
    pathParam(req, "shopId"),
    req.body.hours,
  );
  res.status(200).json(shop);
}
