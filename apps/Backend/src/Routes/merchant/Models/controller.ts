import type { Request, Response } from "express";
import { pool } from "../../../DB/client.ts";
import { listModels } from "../../admin/Models/modelsService.ts";

export async function list(req: Request, res: Response) {
  const models = await listModels(pool, { isActive: true });
  res.status(200).json({ models });
}
