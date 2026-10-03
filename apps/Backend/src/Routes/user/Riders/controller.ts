import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import { kycClient } from "../../../providers/kyc.ts";
import * as ridersService from "./ridersService.ts";

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
