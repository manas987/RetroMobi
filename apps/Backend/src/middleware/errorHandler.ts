import type { NextFunction, Request, Response } from "express";
import {
  EmailNotVerifiedError,
  EmailTakenError,
  InvalidOtpError,
  InvalidSessionError,
  InvalidTicketError,
  PhoneTakenError,
  RateLimitedError,
} from "../Routes/user/Auth/authService.ts";
import { SmsDeliveryError } from "../providers/smsSender.ts";
import {
  BookingNotCancellableError,
  CouponInvalidError,
  InvalidDurationError,
  LicenceInvalidError,
  TooManyVehiclesError,
  VehicleUnavailableError,
} from "../Routes/user/Bookings/bookingsService.ts";
import { DistanceSortUnavailableError } from "../Routes/user/Search/searchService.ts";
import {
  DigilockerRequestNotFoundError,
  RiderHasActiveBookingError,
  RiderNotFoundError,
} from "../Routes/user/Riders/ridersService.ts";
import {
  AlreadyInspectedError,
  BookingNotFoundError,
} from "../Routes/user/Pickup/pickupService.ts";
import { TicketNotFoundError } from "../Routes/Tickets/ticketsService.ts";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof RateLimitedError) {
    res.status(429).json({ error: "rate_limited", message: err.message });
    return;
  }
  if (err instanceof InvalidOtpError) {
    res.status(400).json({ error: "invalid_or_expired_otp", message: err.message });
    return;
  }
  if (err instanceof InvalidSessionError) {
    res.status(401).json({ error: "invalid_or_expired_session", message: err.message });
    return;
  }
  if (err instanceof InvalidTicketError) {
    res.status(401).json({ error: "invalid_or_expired_ticket", message: err.message });
    return;
  }
  if (err instanceof EmailNotVerifiedError) {
    res.status(400).json({ error: "email_not_verified", message: err.message });
    return;
  }
  if (err instanceof PhoneTakenError) {
    res.status(409).json({ error: "phone_taken", message: err.message });
    return;
  }
  if (err instanceof EmailTakenError) {
    res.status(409).json({ error: "email_taken", message: err.message });
    return;
  }
  if (err instanceof SmsDeliveryError) {
    res.status(502).json({ error: "sms_delivery_failed", message: err.message });
    return;
  }
  if (err instanceof VehicleUnavailableError) {
    res.status(409).json({ error: "vehicle_unavailable", message: err.message });
    return;
  }
  if (err instanceof TooManyVehiclesError) {
    res.status(400).json({ error: "too_many_vehicles", message: err.message });
    return;
  }
  if (err instanceof InvalidDurationError) {
    res.status(400).json({ error: "invalid_duration", message: err.message });
    return;
  }
  if (err instanceof LicenceInvalidError) {
    res.status(400).json({ error: "licence_invalid", message: err.message });
    return;
  }
  if (err instanceof CouponInvalidError) {
    res.status(400).json({ error: "coupon_invalid", message: err.message });
    return;
  }
  if (err instanceof DistanceSortUnavailableError) {
    res.status(400).json({ error: "distance_sort_unavailable", message: err.message });
    return;
  }
  if (err instanceof RiderNotFoundError) {
    res.status(404).json({ error: "rider_not_found", message: err.message });
    return;
  }
  if (err instanceof RiderHasActiveBookingError) {
    res.status(409).json({ error: "rider_has_active_booking", message: err.message });
    return;
  }
  if (err instanceof DigilockerRequestNotFoundError) {
    res.status(404).json({ error: "digilocker_request_not_found", message: err.message });
    return;
  }
  if (err instanceof BookingNotFoundError || err instanceof TicketNotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message });
    return;
  }
  if (err instanceof AlreadyInspectedError) {
    res.status(409).json({ error: "already_inspected", message: err.message });
    return;
  }
  if (err instanceof BookingNotCancellableError) {
    res.status(409).json({ error: "booking_not_cancellable", message: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "internal_error" });
}
