import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import { presignUpload } from "../../../lib/storage.ts";
import * as modelsService from "./modelsService.ts";

export async function list(req: Request, res: Response) {
  const query = req.validatedQuery as { isActive?: boolean; q?: string };
  const models = await modelsService.listModels(pool, query);
  res.status(200).json({ models });
}

export async function create(req: Request, res: Response) {
  const model = await modelsService.createModel(pool, req.adminId!, req.body);
  res.status(201).json(model);
}

export async function update(req: Request, res: Response) {
  const model = await modelsService.updateModel(pool, req.adminId!, pathParam(req, "modelId"), req.body);
  res.status(200).json(model);
}

export async function deactivate(req: Request, res: Response) {
  await modelsService.deactivateModel(pool, req.adminId!, pathParam(req, "modelId"));
  res.status(204).send();
}

export async function upload(req: Request, res: Response) {
  const key = `models/${pathParam(req, "modelId")}/${Date.now()}`;
  const result = await presignUpload(key, req.body.contentType);
  res.status(200).json(result);
}

export async function confirm(req: Request, res: Response) {
  const model = await modelsService.attachModelImage(
    pool,
    req.adminId!,
    pathParam(req, "modelId"),
    req.body.storageKey,
  );
  res.status(200).json(model);
}
