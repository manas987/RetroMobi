import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import * as reviewsService from "./reviewsService.ts";

export async function create(req: Request, res: Response) {
  const review = await reviewsService.createReview(pool, req.userId!, req.body);
  res.status(201).json(review);
}

export async function update(req: Request, res: Response) {
  const review = await reviewsService.updateReview(pool, req.userId!, pathParam(req, "reviewId"), req.body);
  res.status(200).json(review);
}

export async function remove(req: Request, res: Response) {
  await reviewsService.softDeleteReview(pool, req.userId!, pathParam(req, "reviewId"));
  res.status(204).send();
}

export async function listForShop(req: Request, res: Response) {
  const query = (req.validatedQuery as { page?: number; limit?: number }) ?? {};
  const reviews = await reviewsService.listShopReviews(pool, pathParam(req, "shopId"), query);
  res.status(200).json({ reviews });
}
