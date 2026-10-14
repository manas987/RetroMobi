import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import { presignUpload } from "../../../lib/storage.ts";
import { trackerClient } from "../../../providers/tracker.ts";
import * as fleetService from "./fleetService.ts";

export async function list(req: Request, res: Response) {
  const vehicles = await fleetService.listVehicles(pool, pathParam(req, "shopId"));
  res.status(200).json({ vehicles });
}

export async function create(req: Request, res: Response) {
  const vehicle = await fleetService.createVehicle(
    pool,
    req.merchantUserId!,
    pathParam(req, "shopId"),
    req.body,
  );
  res.status(201).json(vehicle);
}

export async function get(req: Request, res: Response) {
  const vehicle = await fleetService.getVehicle(pool, pathParam(req, "vehicleId"));
  res.status(200).json(vehicle);
}

export async function update(req: Request, res: Response) {
  const vehicle = await fleetService.updateVehicle(
    pool,
    req.merchantUserId!,
    pathParam(req, "vehicleId"),
    req.body,
  );
  res.status(200).json(vehicle);
}

export async function remove(req: Request, res: Response) {
  await fleetService.softDeleteVehicle(pool, req.merchantUserId!, pathParam(req, "vehicleId"));
  res.status(204).send();
}

export async function upsertRegistration(req: Request, res: Response) {
  await fleetService.upsertRegistrationRecord(
    pool,
    req.merchantUserId!,
    pathParam(req, "vehicleId"),
    req.body,
  );
  res.status(200).json({ updated: true });
}

export async function listDocuments(req: Request, res: Response) {
  const documents = await fleetService.listDocuments(pool, pathParam(req, "vehicleId"));
  res.status(200).json({ documents });
}

export async function createDocument(req: Request, res: Response) {
  const document = await fleetService.createDocument(
    pool,
    req.merchantUserId!,
    pathParam(req, "vehicleId"),
    req.body,
  );
  res.status(201).json(document);
}

export async function removeDocument(req: Request, res: Response) {
  await fleetService.softDeleteDocument(
    pool,
    req.merchantUserId!,
    pathParam(req, "vehicleId"),
    pathParam(req, "documentId"),
  );
  res.status(204).send();
}

export async function uploadDocument(req: Request, res: Response) {
  const key = `vehicles/${pathParam(req, "vehicleId")}/documents/${pathParam(req, "documentId")}/${Date.now()}`;
  const result = await presignUpload(key, req.body.contentType);
  res.status(200).json(result);
}

export async function confirmDocument(req: Request, res: Response) {
  const document = await fleetService.attachDocumentFile(
    pool,
    req.merchantUserId!,
    pathParam(req, "documentId"),
    req.body.storageKey,
  );
  res.status(200).json(document);
}

export async function listMedia(req: Request, res: Response) {
  const media = await fleetService.listMedia(pool, pathParam(req, "vehicleId"));
  res.status(200).json({ media });
}

export async function uploadMedia(req: Request, res: Response) {
  const key = `vehicles/${pathParam(req, "vehicleId")}/media/${Date.now()}`;
  const result = await presignUpload(key, req.body.contentType);
  res.status(200).json(result);
}

export async function confirmMedia(req: Request, res: Response) {
  const media = await fleetService.addMedia(
    pool,
    req.merchantUserId!,
    pathParam(req, "vehicleId"),
    req.body,
  );
  res.status(201).json(media);
}

export async function reorderMedia(req: Request, res: Response) {
  await fleetService.reorderMedia(pool, req.merchantUserId!, pathParam(req, "vehicleId"), req.body.order);
  res.status(200).json({ reordered: true });
}

export async function removeMedia(req: Request, res: Response) {
  await fleetService.softDeleteMedia(
    pool,
    req.merchantUserId!,
    pathParam(req, "vehicleId"),
    pathParam(req, "mediaId"),
  );
  res.status(204).send();
}

export async function listAccessories(req: Request, res: Response) {
  const accessories = await fleetService.listAccessories(pool, pathParam(req, "vehicleId"));
  res.status(200).json({ accessories });
}

export async function setAccessory(req: Request, res: Response) {
  const accessory = await fleetService.setAccessory(
    pool,
    req.merchantUserId!,
    pathParam(req, "vehicleId"),
    req.body,
  );
  res.status(201).json(accessory);
}

export async function deleteAccessory(req: Request, res: Response) {
  await fleetService.deleteAccessory(
    pool,
    req.merchantUserId!,
    pathParam(req, "vehicleId"),
    pathParam(req, "accessoryId"),
  );
  res.status(204).send();
}

export async function listUnavailability(req: Request, res: Response) {
  const blocks = await fleetService.listUnavailability(pool, pathParam(req, "vehicleId"));
  res.status(200).json({ blocks });
}

export async function addUnavailability(req: Request, res: Response) {
  const block = await fleetService.addUnavailability(
    pool,
    req.merchantUserId!,
    pathParam(req, "vehicleId"),
    req.body,
  );
  res.status(201).json(block);
}

export async function deleteUnavailability(req: Request, res: Response) {
  await fleetService.deleteUnavailability(
    pool,
    req.merchantUserId!,
    pathParam(req, "vehicleId"),
    pathParam(req, "blockId"),
  );
  res.status(204).send();
}

export async function assignTracker(req: Request, res: Response) {
  await fleetService.assignTracker(pool, req.merchantUserId!, pathParam(req, "vehicleId"), req.body);
  res.status(200).json({ assigned: true });
}

export async function unassignTracker(req: Request, res: Response) {
  await fleetService.unassignTracker(pool, req.merchantUserId!, pathParam(req, "vehicleId"));
  res.status(204).send();
}

export async function getLocation(req: Request, res: Response) {
  const position = await fleetService.getVehicleLocation(
    pool,
    pathParam(req, "vehicleId"),
    trackerClient,
  );
  res.status(200).json({ position });
}
