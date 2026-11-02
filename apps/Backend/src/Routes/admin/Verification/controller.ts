import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import { presignDownload } from "../../../lib/storage.ts";
import * as verificationService from "./verificationService.ts";

export async function queue(req: Request, res: Response) {
  const { type, status } = req.validatedQuery as {
    type: verificationService.VerifiableType;
    status?: string;
  };
  const rows = await verificationService.listVerificationQueue(pool, type, status);
  res.status(200).json({ rows });
}

export async function document(req: Request, res: Response) {
  const storageKey = await verificationService.getVerificationStorageKey(
    pool,
    pathParam(req, "type") as verificationService.VerifiableType,
    pathParam(req, "id"),
  );
  const downloadUrl = await presignDownload(storageKey);
  res.status(200).json({ downloadUrl });
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

// --- rider driving licences (docs/dl-verification.md) -------------------

export async function riderVerificationReview(req: Request, res: Response) {
  const result = await verificationService.decideRiderVerification(
    pool,
    req.adminId!,
    pathParam(req, "sessionId"),
    req.body,
  );
  res.status(200).json(result);
}

export async function riderVerificationPhoto(req: Request, res: Response) {
  const downloadUrl = await verificationService.getRiderVerificationPhotoUrl(
    pool,
    pathParam(req, "sessionId"),
  );
  res.status(200).json({ downloadUrl });
}

export async function riderVerificationEvents(req: Request, res: Response) {
  const events = await verificationService.getRiderVerificationEvents(
    pool,
    pathParam(req, "sessionId"),
  );
  res.status(200).json({ events });
}
