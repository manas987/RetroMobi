import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import * as ticketsService from "../../Tickets/ticketsService.ts";

export async function create(req: Request, res: Response) {
  const ticket = await ticketsService.openTicket(pool, {
    bookingId: req.body.bookingId ?? null,
    openedByType: "CUSTOMER",
    openedById: req.userId!,
    subject: req.body.subject,
    firstMessage: req.body.firstMessage,
  });
  res.status(201).json(ticket);
}

export async function list(req: Request, res: Response) {
  const tickets = await ticketsService.listTickets(pool, { partyType: "CUSTOMER", partyId: req.userId! });
  res.status(200).json({ tickets });
}

export async function get(req: Request, res: Response) {
  const ticket = await ticketsService.getTicket(pool, pathParam(req, "id"), "CUSTOMER", req.userId!);
  res.status(200).json(ticket);
}

export async function messages(req: Request, res: Response) {
  const since = (req.validatedQuery as { since?: string })?.since;
  const rows = await ticketsService.getMessages(pool, pathParam(req, "id"), "CUSTOMER", req.userId!, since);
  res.status(200).json({ messages: rows });
}

export async function postMessage(req: Request, res: Response) {
  const message = await ticketsService.postMessage(
    pool,
    pathParam(req, "id"),
    { partyType: "CUSTOMER", partyId: req.userId! },
    req.body.body,
  );
  res.status(201).json(message);
}
