import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import * as licenceVehiclesService from "./licenceVehiclesService.ts";

export async function list(req: Request, res: Response) {
  const rows = await licenceVehiclesService.listLicenceVehicles(pool, pathParam(req, "licenceId"));
  res.status(200).json({ rows });
}

export async function link(req: Request, res: Response) {
  const row = await licenceVehiclesService.linkVehicle(
    pool,
    req.adminId!,
    pathParam(req, "licenceId"),
    req.body,
  );
  res.status(201).json(row);
}

export async function unlink(req: Request, res: Response) {
  await licenceVehiclesService.unlinkVehicle(pool, req.adminId!, pathParam(req, "linkId"));
  res.status(204).send();
}
