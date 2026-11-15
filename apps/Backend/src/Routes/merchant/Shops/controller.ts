import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import { presignDownload, presignUpload, storageConfigured } from "../../../lib/storage.ts";
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

export async function reviews(req: Request, res: Response) {
  const result = await shopsService.listShopReviews(pool, pathParam(req, "shopId"));
  res.status(200).json(result);
}

export async function listMedia(req: Request, res: Response) {
  const media = await shopsService.listShopMedia(pool, pathParam(req, "shopId"));
  res.status(200).json({ media });
}

export async function uploadMedia(req: Request, res: Response) {
  const key = `shops/${pathParam(req, "shopId").toLowerCase()}/media/${crypto.randomUUID()}`;
  res.status(200).json(await presignUpload(key, req.body.contentType));
}

export async function confirmMedia(req: Request, res: Response) {
  const media = await shopsService.addShopMedia(pool, req.merchantUserId!, pathParam(req, "shopId"), req.body);
  res.status(201).json(media);
}

export async function reorderMedia(req: Request, res: Response) {
  await shopsService.reorderShopMedia(pool, pathParam(req, "shopId"), req.body.order);
  res.status(200).json({ reordered: true });
}

export async function publishMedia(req: Request, res: Response) {
  const updated = await shopsService.setShopMediaPublication(
    pool, pathParam(req, "shopId").toLowerCase(), pathParam(req, "mediaId"), req.body.published, req.merchantUserId!,
  );
  if (!updated && !storageConfigured()) {
    res.status(503).json({ error: "storage_unconfigured", message: "File storage isn't set up on this server, so photos can't be checked or shown." });
    return;
  }
  if (!updated) {
    res.status(400).json({ error: "invalid_photo", message: "Upload a JPEG, PNG, WebP, AVIF, or GIF to publish this photo." });
    return;
  }
  res.status(204).send();
}

export async function removeMedia(req: Request, res: Response) {
  await shopsService.softDeleteShopMedia(pool, req.merchantUserId!, pathParam(req, "shopId"), pathParam(req, "mediaId"));
  res.status(204).send();
}

export async function downloadMedia(req: Request, res: Response) {
  const key = await shopsService.getShopMediaStorageKey(pool, pathParam(req, "shopId"), pathParam(req, "mediaId"));
  res.status(200).json({ downloadUrl: await presignDownload(key) });
}

export async function listDocuments(req: Request, res: Response) {
  const documents = await shopsService.listShopDocuments(pool, pathParam(req, "shopId"));
  res.status(200).json({ documents });
}

export async function createDocument(req: Request, res: Response) {
  const document = await shopsService.createShopDocument(pool, req.merchantUserId!, pathParam(req, "shopId"), req.body);
  res.status(201).json(document);
}

export async function uploadDocument(req: Request, res: Response) {
  const key = `shops/${pathParam(req, "shopId")}/documents/${pathParam(req, "documentId")}/${Date.now()}`;
  res.status(200).json(await presignUpload(key, req.body.contentType));
}

export async function confirmDocument(req: Request, res: Response) {
  const document = await shopsService.attachShopDocumentFile(
    pool, req.merchantUserId!, pathParam(req, "shopId"), pathParam(req, "documentId"), req.body.storageKey,
  );
  res.status(200).json(document);
}

export async function downloadDocument(req: Request, res: Response) {
  const key = await shopsService.getShopDocumentStorageKey(pool, pathParam(req, "shopId"), pathParam(req, "documentId"));
  res.status(200).json({ downloadUrl: await presignDownload(key) });
}

export async function removeDocument(req: Request, res: Response) {
  await shopsService.softDeleteShopDocument(pool, req.merchantUserId!, pathParam(req, "shopId"), pathParam(req, "documentId"));
  res.status(204).send();
}
