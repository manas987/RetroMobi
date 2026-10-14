import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import * as adminsService from "./adminsService.ts";

export async function list(req: Request, res: Response) {
  const admins = await adminsService.listAdmins(pool);
  res.status(200).json({ admins });
}

export async function create(req: Request, res: Response) {
  const admin = await adminsService.createAdmin(pool, req.adminId!, req.body);
  res.status(201).json(admin);
}

export async function update(req: Request, res: Response) {
  const admin = await adminsService.updateAdmin(
    pool,
    req.adminId!,
    pathParam(req, "adminId"),
    req.body,
  );
  res.status(200).json(admin);
}

export async function remove(req: Request, res: Response) {
  await adminsService.softDeleteAdmin(pool, req.adminId!, pathParam(req, "adminId"));
  res.status(204).send();
}
