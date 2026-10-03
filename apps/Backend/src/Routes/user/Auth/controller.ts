import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import * as authService from "./authService.ts";
import { sendOtpEmail } from "../../../providers/emailSender.ts";
import { verifyGoogleIdToken } from "../../../providers/google.ts";
import { sendOtpSms } from "../../../providers/smsSender.ts";

export async function sendOtp(req: Request, res: Response) {
  const { phone } = req.body as { phone: string };
  const result = await authService.requestOtp(pool, phone, sendOtpSms);
  res.status(200).json({
    message: "OTP sent",
    expiresInSeconds: result.expiresInSeconds,
  });
}

export async function verifyOtp(req: Request, res: Response) {
  const { phone, code, deviceId } = req.body as {
    phone: string;
    code: string;
    deviceId: string;
  };
  const result = await authService.verifyOtp(pool, { phone, code, deviceId });
  res.status(200).json(result);
}

export async function sendEmailOtp(req: Request, res: Response) {
  const { signupTicket, email } = req.body as { signupTicket: string; email: string };
  const result = await authService.requestEmailOtp(pool, { signupTicket, email }, sendOtpEmail);
  res.status(200).json({
    message: "OTP sent",
    expiresInSeconds: result.expiresInSeconds,
  });
}

export async function verifyEmailOtp(req: Request, res: Response) {
  const { signupTicket, email, code } = req.body as {
    signupTicket: string;
    email: string;
    code: string;
  };
  const result = await authService.verifyEmailOtp(pool, { signupTicket, email, code });
  res.status(200).json(result);
}

export async function googleAuth(req: Request, res: Response) {
  const { idToken } = req.body as { idToken: string };
  const result = await authService.googlePrefill(idToken, verifyGoogleIdToken);
  res.status(200).json(result);
}

export async function completeSignup(req: Request, res: Response) {
  const { signupTicket, deviceId, name, email, emailVerificationTicket, googlePrefillTicket } =
    req.body as {
      signupTicket: string;
      deviceId: string;
      name?: string;
      email?: string;
      emailVerificationTicket?: string;
      googlePrefillTicket?: string;
    };
  const result = await authService.completeSignup(pool, {
    signupTicket,
    deviceId,
    name,
    email,
    emailVerificationTicket,
    googlePrefillTicket,
  });
  res.status(200).json(result);
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken, deviceId } = req.body as {
    refreshToken: string;
    deviceId: string;
  };
  const result = await authService.refreshSession(pool, { refreshToken, deviceId });
  res.status(200).json(result);
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = req.body as { refreshToken: string };
  await authService.logout(pool, { userId: req.userId!, refreshToken });
  res.status(204).send();
}

export async function revokeSession(req: Request, res: Response) {
  const found = await authService.revokeSession(pool, {
    userId: req.userId!,
    sessionId: pathParam(req, "id"),
  });
  if (!found) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(204).send();
}
