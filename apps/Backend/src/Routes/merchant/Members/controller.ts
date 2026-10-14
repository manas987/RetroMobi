import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import * as membersService from "./membersService.ts";

export async function list(req: Request, res: Response) {
  const members = await membersService.listMembers(pool, pathParam(req, "shopId"));
  res.status(200).json({ members });
}

export async function listShopInvites(req: Request, res: Response) {
  const invites = await membersService.listInvites(pool, pathParam(req, "shopId"));
  res.status(200).json({ invites });
}

export async function invite(req: Request, res: Response) {
  const invite = await membersService.inviteMember(
    pool,
    req.merchantUserId!,
    pathParam(req, "shopId"),
    req.body,
  );
  res.status(201).json(invite);
}

export async function listMyInvites(req: Request, res: Response) {
  const invites = await membersService.listMyInvites(pool, req.merchantUserId!);
  res.status(200).json({ invites });
}

export async function respond(req: Request, res: Response) {
  await membersService.respondToInvite(
    pool,
    req.merchantUserId!,
    pathParam(req, "inviteId"),
    req.body.accept,
  );
  res.status(204).send();
}

export async function updateRole(req: Request, res: Response) {
  const member = await membersService.updateMemberRole(
    pool,
    req.merchantUserId!,
    pathParam(req, "shopId"),
    pathParam(req, "memberId"),
    req.body.role,
  );
  res.status(200).json(member);
}

export async function remove(req: Request, res: Response) {
  await membersService.removeMember(
    pool,
    req.merchantUserId!,
    pathParam(req, "shopId"),
    pathParam(req, "memberId"),
  );
  res.status(204).send();
}
