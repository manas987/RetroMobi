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
import { SmsDeliveryError } from "../Routes/user/Auth/smsSender.ts";

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

  console.error(err);
  res.status(500).json({ error: "internal_error" });
}
