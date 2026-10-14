import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import * as couponsService from "./couponsService.ts";

export async function list(req: Request, res: Response) {
  const query = req.validatedQuery as { status?: string };
  const coupons = await couponsService.listCoupons(pool, query);
  res.status(200).json({ coupons });
}

export async function create(req: Request, res: Response) {
  const coupon = await couponsService.createCoupon(pool, req.adminId!, req.body);
  res.status(201).json(coupon);
}

export async function setStatus(req: Request, res: Response) {
  const coupon = await couponsService.setCouponStatus(
    pool,
    req.adminId!,
    pathParam(req, "couponId"),
    req.body.status,
  );
  res.status(200).json(coupon);
}

export async function remove(req: Request, res: Response) {
  await couponsService.softDeleteCoupon(pool, req.adminId!, pathParam(req, "couponId"));
  res.status(204).send();
}

export async function hardRemove(req: Request, res: Response) {
  await couponsService.hardDeleteCoupon(pool, req.adminId!, pathParam(req, "couponId"));
  res.status(204).send();
}
