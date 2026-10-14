import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import { cashfreeClient } from "../../../providers/cashfree.ts";
import * as ticketsService from "../../Tickets/ticketsService.ts";
import * as depositService from "./depositService.ts";

export async function queue(req: Request, res: Response) {
  const query = req.validatedQuery as { status?: string; assignedTo?: string; unassigned?: boolean };
  const assignedTo = query.assignedTo === "me" ? req.adminId! : query.assignedTo;
  const tickets = await ticketsService.listTicketQueue(pool, { ...query, assignedTo });
  res.status(200).json({ tickets });
}

export async function get(req: Request, res: Response) {
  const ticket = await ticketsService.getTicketForAdmin(pool, pathParam(req, "id"));
  res.status(200).json(ticket);
}

export async function messages(req: Request, res: Response) {
  const since = (req.validatedQuery as { since?: string })?.since;
  const rows = await ticketsService.getMessagesForAdmin(pool, pathParam(req, "id"), since);
  res.status(200).json({ messages: rows });
}

export async function postMessage(req: Request, res: Response) {
  const message = await ticketsService.postMessage(
    pool,
    pathParam(req, "id"),
    { partyType: "ADMIN", partyId: req.adminId! },
    req.body.body,
  );
  res.status(201).json(message);
}

export async function assign(req: Request, res: Response) {
  await ticketsService.assignTicket(pool, pathParam(req, "id"), req.body.adminId);
  res.status(200).json({ assigned: true });
}

export async function resolve(req: Request, res: Response) {
  await ticketsService.resolveTicket(pool, pathParam(req, "id"), req.body.resolution, req.adminId!);
  res.status(200).json({ resolved: true });
}

export async function addableParties(req: Request, res: Response) {
  const parties = await ticketsService.listAddableParties(pool, pathParam(req, "id"));
  res.status(200).json({ parties });
}

export async function addParticipant(req: Request, res: Response) {
  await ticketsService.addParticipant(pool, req.adminId!, pathParam(req, "id"), req.body);
  res.status(204).send();
}

export async function getDeposit(req: Request, res: Response) {
  const deposit = await depositService.getDepositForTicket(pool, pathParam(req, "id"));
  res.status(200).json(deposit);
}

export async function settleDeposit(req: Request, res: Response) {
  const result = await depositService.settleDeposit(
    pool,
    req.adminId!,
    pathParam(req, "id"),
    req.body,
    cashfreeClient,
  );
  res.status(200).json(result);
}
