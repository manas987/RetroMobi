import type { Request, Response } from "express";
import { pool } from "../../../DB/client.ts";
import { sendOtpSms } from "../../../providers/smsSender.ts";
import * as adminAuthService from "./adminAuthService.ts";

export async function sendOtp(req: Request, res: Response) {
  const { phone } = req.body as { phone: string };
  const result = await adminAuthService.requestAdminOtp(pool, phone, sendOtpSms);
  res.status(200).json({ message: "OTP sent", expiresInSeconds: result.expiresInSeconds });
}

export async function verifyOtp(req: Request, res: Response) {
  const { phone, code, deviceId } = req.body as { phone: string; code: string; deviceId: string };
  const result = await adminAuthService.verifyAdminOtp(pool, { phone, code, deviceId });
  res.status(200).json(result);
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken, deviceId } = req.body as { refreshToken: string; deviceId: string };
  const result = await adminAuthService.refreshAdminSession(pool, { refreshToken, deviceId });
  res.status(200).json(result);
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = req.body as { refreshToken: string };
  await adminAuthService.adminLogout(pool, { adminId: req.adminId!, refreshToken });
  res.status(204).send();
}
