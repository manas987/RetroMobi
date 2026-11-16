import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import { cashfreeClient } from "../../../providers/cashfree.ts";
import * as ticketsService from "../../Tickets/ticketsService.ts";
import { BookingNotFoundError } from "../../user/Pickup/pickupService.ts";
import * as pickupService from "../../user/Pickup/pickupService.ts";
import * as operationsService from "./operationsService.ts";
import { cancelBooking } from "../../user/Bookings/bookingsService.ts";
import * as identityService from "./identityService.ts";

export async function list(req: Request, res: Response) {
  const query = req.validatedQuery as operationsService.ListBookingsFilters;
  const bookings = await operationsService.listBookings(pool, pathParam(req, "shopId"), query);
  res.status(200).json({ bookings });
}

export async function get(req: Request, res: Response) {
  const booking = await operationsService.getBooking(
    pool,
    pathParam(req, "shopId"),
    pathParam(req, "bookingId"),
  );
  if (!booking) throw new BookingNotFoundError(`booking ${pathParam(req, "bookingId")} not found`);
  res.status(200).json(booking);
}

export async function createWalkin(req: Request, res: Response) {
  const result = await operationsService.createWalkinRental(pool, {
    merchantUserId: req.merchantUserId!,
    ...req.body,
  });
  res.status(201).json(result);
}

export async function pickup(req: Request, res: Response) {
  await pickupService.merchantPickup(pool, {
    merchantUserId: req.merchantUserId!,
    bookingId: pathParam(req, "bookingId"),
  });
  res.status(200).json({ picked_up: true });
}

export async function returnBooking(req: Request, res: Response) {
  const result = await pickupService.merchantReturn(
    pool,
    {
      merchantUserId: req.merchantUserId!,
      bookingId: pathParam(req, "bookingId"),
      claim: req.body.claim,
      reason: req.body.reason,
      amount: req.body.amount,
    },
    cashfreeClient,
    (args) => ticketsService.openTicket(pool, args),
  );
  res.status(200).json(result);
}

/** What staff compare the person in front of them against. Minimal on purpose. */
export async function identity(req: Request, res: Response) {
  const result = await identityService.getIdentityForPickup(
    pool,
    req.merchantUserId!,
    pathParam(req, "bookingId"),
  );
  res.status(200).json(result);
}

export async function identityCheck(req: Request, res: Response) {
  const result = await identityService.recordIdentityCheck(
    pool,
    req.merchantUserId!,
    pathParam(req, "bookingId"),
    req.body,
  );
  res.status(201).json(result);
}

export async function pickupLicenceDecision(req: Request, res: Response) {
  const bookingId = pathParam(req, "id");
  const merchantUserId = req.merchantUserId!;
  const shopId = req.shopId!;
  if (req.body.decision === "refuse") {
    const result = await cancelBooking(pool, {
      bookingId, refusal: { merchantUserId, shopId, reason: req.body.reason },
    }, cashfreeClient);
    res.json({ ...result, decision: "refused" });
    return;
  }
  await identityService.approvePickupLicence(pool, merchantUserId, shopId, bookingId);
  res.json({ decision: "approved" });
}
