import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import * as verificationService from "./verificationService.ts";

export async function queue(req: Request, res: Response) {
  const { type } = req.validatedQuery as { type: verificationService.VerifiableType };
  const rows = await verificationService.listVerificationQueue(pool, type);
  res.status(200).json({ rows });
}

export async function shop(req: Request, res: Response) {
  await verificationService.decideShop(pool, req.adminId!, pathParam(req, "shopId"), req.body);
  res.status(200).json({ decided: true });
}

export async function vehicle(req: Request, res: Response) {
  await verificationService.decideVehicle(pool, req.adminId!, pathParam(req, "vehicleId"), req.body);
  res.status(200).json({ decided: true });
}

export async function vehicleDocument(req: Request, res: Response) {
  await verificationService.decideVehicleDocument(
    pool,
    req.adminId!,
    pathParam(req, "documentId"),
    req.body,
  );
  res.status(200).json({ decided: true });
}

export async function merchantDocument(req: Request, res: Response) {
  await verificationService.decideMerchantDocument(
    pool,
    req.adminId!,
    pathParam(req, "documentId"),
    req.body,
  );
  res.status(200).json({ decided: true });
}

export async function shopLicence(req: Request, res: Response) {
  await verificationService.decideShopLicence(
    pool,
    req.adminId!,
    pathParam(req, "licenceId"),
    req.body,
  );
  res.status(200).json({ decided: true });
}
