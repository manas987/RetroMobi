import type { Request, Response } from "express";
import { pool } from "../../../DB/client.ts";
import { sendOtpSms } from "../../../providers/smsSender.ts";
import * as merchantAuthService from "./merchantAuthService.ts";

export async function sendOtp(req: Request, res: Response) {
  const { phone } = req.body as { phone: string };
  const result = await merchantAuthService.requestMerchantOtp(pool, phone, sendOtpSms);
  res.status(200).json({ message: "OTP sent", expiresInSeconds: result.expiresInSeconds });
}

export async function verifyOtp(req: Request, res: Response) {
  const { phone, code, deviceId } = req.body as { phone: string; code: string; deviceId: string };
  const result = await merchantAuthService.verifyMerchantOtp(pool, { phone, code, deviceId });
  res.status(200).json(result);
}

export async function completeSignup(req: Request, res: Response) {
  const { signupTicket, deviceId, name, email } = req.body as {
    signupTicket: string;
    deviceId: string;
    name: string;
    email?: string;
  };
  const result = await merchantAuthService.completeMerchantSignup(pool, {
    signupTicket,
    deviceId,
    name,
    email,
  });
  res.status(200).json(result);
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken, deviceId } = req.body as { refreshToken: string; deviceId: string };
  const result = await merchantAuthService.refreshMerchantSession(pool, { refreshToken, deviceId });
  res.status(200).json(result);
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = req.body as { refreshToken: string };
  await merchantAuthService.merchantLogout(pool, { merchantUserId: req.merchantUserId!, refreshToken });
  res.status(204).send();
}
