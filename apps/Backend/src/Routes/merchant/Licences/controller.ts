import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import { presignUpload } from "../../../lib/storage.ts";
import * as licencesService from "./licencesService.ts";

export async function list(req: Request, res: Response) {
  const licences = await licencesService.listLicences(pool, req.merchantUserId!);
  res.status(200).json({ licences });
}

export async function create(req: Request, res: Response) {
  const licence = await licencesService.createLicence(pool, req.merchantUserId!, req.body);
  res.status(201).json(licence);
}

export async function remove(req: Request, res: Response) {
  await licencesService.softDeleteLicence(pool, req.merchantUserId!, pathParam(req, "licenceId"));
  res.status(204).send();
}

export async function upload(req: Request, res: Response) {
  const key = `licences/${pathParam(req, "licenceId")}/${Date.now()}`;
  const result = await presignUpload(key, req.body.contentType);
  res.status(200).json(result);
}

export async function confirm(req: Request, res: Response) {
  const licence = await licencesService.attachLicenceFile(
    pool,
    req.merchantUserId!,
    pathParam(req, "licenceId"),
    req.body.storageKey,
  );
  res.status(200).json(licence);
}

export async function linkShop(req: Request, res: Response) {
  await licencesService.linkLicenceToShop(pool, req.merchantUserId!, pathParam(req, "licenceId"), req.body);
  res.status(204).send();
}

export async function unlinkShop(req: Request, res: Response) {
  await licencesService.unlinkLicenceFromShop(
    pool,
    req.merchantUserId!,
    pathParam(req, "licenceId"),
    pathParam(req, "shopId"),
  );
  res.status(204).send();
}

export async function listDocuments(req: Request, res: Response) {
  const documents = await licencesService.listMerchantDocuments(pool, req.merchantUserId!);
  res.status(200).json({ documents });
}

export async function createDocument(req: Request, res: Response) {
  const document = await licencesService.createMerchantDocument(pool, req.merchantUserId!, req.body);
  res.status(201).json(document);
}

export async function removeDocument(req: Request, res: Response) {
  await licencesService.softDeleteMerchantDocument(pool, req.merchantUserId!, pathParam(req, "documentId"));
  res.status(204).send();
}

export async function uploadDocument(req: Request, res: Response) {
  const key = `merchant-documents/${pathParam(req, "documentId")}/${Date.now()}`;
  const result = await presignUpload(key, req.body.contentType);
  res.status(200).json(result);
}

export async function confirmDocument(req: Request, res: Response) {
  const document = await licencesService.attachMerchantDocumentFile(
    pool,
    req.merchantUserId!,
    pathParam(req, "documentId"),
    req.body.storageKey,
  );
  res.status(200).json(document);
}
