import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import { kycClient } from "../../../providers/kyc.ts";
import * as ridersService from "./ridersService.ts";
import * as verification from "./verificationService.ts";

export async function list(req: Request, res: Response) {
  const riders = await ridersService.listRiders(pool, req.userId!);
  res.status(200).json({ riders });
}

export async function create(req: Request, res: Response) {
  const rider = await ridersService.createRider(pool, req.userId!, req.body);
  res.status(201).json(rider);
}

export async function update(req: Request, res: Response) {
  const rider = await ridersService.updateRider(pool, req.userId!, pathParam(req, "id"), req.body);
  res.status(200).json(rider);
}

export async function remove(req: Request, res: Response) {
  await ridersService.deleteRider(pool, req.userId!, pathParam(req, "id"));
  res.status(204).send();
}

export async function digilockerInit(req: Request, res: Response) {
  const result = await ridersService.requestDigilockerConsent(
    pool,
    req.userId!,
    pathParam(req, "id"),
    req.body.redirectUrl,
    kycClient,
  );
  res.status(200).json(result);
}

export async function digilockerCallback(req: Request, res: Response) {
  const result = await ridersService.completeDigilockerVerification(
    pool,
    req.userId!,
    pathParam(req, "id"),
    req.body.requestId,
    kycClient,
  );
  res.status(200).json(result);
}

export async function manualLicence(req: Request, res: Response) {
  const result = await ridersService.verifyLicenceManually(
    pool,
    req.userId!,
    pathParam(req, "id"),
    req.body,
    kycClient,
  );
  res.status(200).json(result);
}

// --- verification sessions (docs/dl-verification.md) ---------------------

/** The exact wording the UI must show, so consent cannot drift from the record. */
export function consentText(_req: Request, res: Response) {
  res.status(200).json({ consentText: verification.CONSENT_TEXT });
}

export async function startVerification(req: Request, res: Response) {
  const result = await verification.startSession(
    pool,
    req.userId!,
    pathParam(req, "id"),
    { ...req.body, ip: req.ip },
    kycClient,
  );
  res.status(201).json(result);
}

export async function verificationStatus(req: Request, res: Response) {
  const result = await verification.getSessionStatus(
    pool,
    req.userId!,
    pathParam(req, "id"),
    pathParam(req, "sessionId"),
  );
  res.status(200).json(result);
}

export async function completeDigilocker(req: Request, res: Response) {
  const result = await verification.completeDigilocker(
    pool,
    req.userId!,
    pathParam(req, "id"),
    pathParam(req, "sessionId"),
    kycClient,
  );
  res.status(200).json(result);
}

export async function verifyDlNumber(req: Request, res: Response) {
  const result = await verification.verifyByDlNumber(
    pool,
    req.userId!,
    pathParam(req, "id"),
    pathParam(req, "sessionId"),
    req.body,
    kycClient,
  );
  res.status(200).json(result);
}

export async function photoUpload(req: Request, res: Response) {
  const result = await verification.requestPhotoUpload(
    pool,
    req.userId!,
    pathParam(req, "id"),
    pathParam(req, "sessionId"),
    req.body.contentType,
  );
  res.status(200).json(result);
}

export async function photoConfirm(req: Request, res: Response) {
  const result = await verification.confirmPhotoUpload(
    pool,
    req.userId!,
    pathParam(req, "id"),
    pathParam(req, "sessionId"),
    { contentType: req.body.contentType },
  );
  res.status(200).json(result);
}

export async function retryVerification(req: Request, res: Response) {
  const result = await verification.retrySession(
    pool,
    req.userId!,
    pathParam(req, "id"),
    pathParam(req, "sessionId"),
    { redirectUrl: req.body.redirectUrl, ip: req.ip },
    kycClient,
  );
  res.status(201).json(result);
}

export async function cancelVerification(req: Request, res: Response) {
  const result = await verification.cancelSession(
    pool,
    req.userId!,
    pathParam(req, "id"),
    pathParam(req, "sessionId"),
  );
  res.status(200).json(result);
}

/** Documented in backend.md since Phase 8 and never actually implemented. */
export async function licence(req: Request, res: Response) {
  const result = await verification.getLicence(pool, req.userId!, pathParam(req, "id"));
  res.status(200).json(result);
}
