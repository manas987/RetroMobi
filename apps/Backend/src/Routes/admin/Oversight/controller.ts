import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import * as oversightService from "./oversightService.ts";
import { verificationMetrics } from "../../../lib/verificationMetrics.ts";

export async function listMerchants(req: Request, res: Response) {
  const rows = await oversightService.listMerchants(pool, req.validatedQuery as any);
  res.status(200).json({ merchants: rows });
}

export async function getMerchant(req: Request, res: Response) {
  const merchant = await oversightService.getMerchant(pool, pathParam(req, "id"));
  res.status(200).json(merchant);
}

export async function listShops(req: Request, res: Response) {
  const rows = await oversightService.listAllShops(pool, req.validatedQuery as any);
  res.status(200).json({ shops: rows });
}

export async function listVehicles(req: Request, res: Response) {
  const rows = await oversightService.listAllVehicles(pool, req.validatedQuery as any);
  res.status(200).json({ vehicles: rows });
}

export async function listBookings(req: Request, res: Response) {
  const rows = await oversightService.listAllBookings(pool, req.validatedQuery as any);
  res.status(200).json({ bookings: rows });
}

export async function listLicences(req: Request, res: Response) {
  const licences = await oversightService.listLicences(pool, req.validatedQuery as never);
  res.status(200).json({ licences });
}

export async function listPayments(req: Request, res: Response) {
  const rows = await oversightService.listAllPayments(pool, req.validatedQuery as any);
  res.status(200).json({ payments: rows });
}

export async function listPayouts(req: Request, res: Response) {
  const rows = await oversightService.listAllPayouts(pool, req.validatedQuery as any);
  res.status(200).json({ payouts: rows });
}

export async function listAuditLogs(req: Request, res: Response) {
  const rows = await oversightService.listAuditLogs(pool, req.validatedQuery as any);
  res.status(200).json({ auditLogs: rows });
}

/** Rider verification health. See lib/verificationMetrics.ts for why it is one query. */
export async function verificationHealth(req: Request, res: Response) {
  const days = Number((req.query.days as string) ?? 30);
  const metrics = await verificationMetrics(pool, Number.isFinite(days) && days > 0 ? days : 30);
  res.status(200).json(metrics);
}
