import type { Request, Response } from "express";
import { pathParam } from "../../../lib/pathParam.ts";
import { pool } from "../../../DB/client.ts";
import * as authService from "./authService.ts";
import { sendOtpEmail } from "../../../providers/emailSender.ts";
import { verifyGoogleIdToken } from "../../../providers/google.ts";
import { verifyFirebasePhoneToken } from "../../../providers/firebase.ts";
import { isWhatsAppConfigured, sendOtpWhatsApp } from "../../../providers/whatsapp.ts";

function sessionDetails(req: Request) {
  const ua = req.get("user-agent") ?? "";
  const deviceName = /iPhone/i.test(ua) ? "iPhone" : /iPad/i.test(ua) ? "iPad" :
    /Android/i.test(ua) ? (/Mobile/i.test(ua) ? "Android phone" : "Android tablet") :
    /Macintosh|Mac OS/i.test(ua) ? "Mac" : /Windows/i.test(ua) ? "Windows PC" :
    /CrOS/i.test(ua) ? "Chromebook" : /Linux/i.test(ua) ? "Linux computer" : null;
  const browserName = /Edg(?:A|iOS)?\//i.test(ua) ? "Edge" : /OPR\/|Opera/i.test(ua) ? "Opera" :
    /Firefox\/|FxiOS\//i.test(ua) ? "Firefox" : /Chrome\/|CriOS\//i.test(ua) ? "Chrome" :
    /Safari\//i.test(ua) ? "Safari" : null;
  let loginLocation: string | null = null;
  if (process.env.TRUST_CF_LOCATION_HEADERS === "true") {
    const city = req.get("cf-ipcity")?.trim().slice(0, 96);
    const region = req.get("cf-region")?.trim().slice(0, 96);
    const country = req.get("cf-ipcountry")?.toUpperCase() ?? "";
    const countryName = /^[A-Z]{2}$/.test(country) && country !== "XX"
      ? new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }).of(country) : null;
    loginLocation = [...new Set([city || region, countryName].filter(Boolean))].join(", ") || null;
  }
  return { deviceName, browserName, loginLocation };
}

export async function sendOtp(req: Request, res: Response) {
  const { phone } = req.body as { phone: string };
  const result = await authService.requestOtp(pool, phone, sendOtpWhatsApp);
  res.status(200).json({
    message: "OTP sent",
    expiresInSeconds: result.expiresInSeconds,
    // Unconfigured WhatsApp is the dev-fallback: the code only reached the
    // server log. Say so, so the client can switch to Firebase SMS. (A failed
    // send throws instead -- a 502 otp_delivery_failed, see errorHandler.)
    ...(isWhatsAppConfigured() ? {} : { fallback: "firebase" }),
  });
}

export async function verifyOtp(req: Request, res: Response) {
  const { phone, code, deviceId } = req.body as {
    phone: string;
    code: string;
    deviceId: string;
  };
  const result = await authService.verifyOtp(pool, { phone, code, deviceId, sessionDetails: sessionDetails(req) });
  res.status(200).json(result);
}

export async function verifyFirebaseOtp(req: Request, res: Response) {
  const { phone, idToken, deviceId } = req.body as { phone: string; idToken: string; deviceId: string };
  const result = await authService.verifyFirebaseOtp(
    pool,
    { phone, idToken, deviceId, sessionDetails: sessionDetails(req) },
    verifyFirebasePhoneToken,
  );
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
    sessionDetails: sessionDetails(req),
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

export async function listSessions(req: Request, res: Response) {
  const sessions = await authService.listSessions(pool, req.userId!, req.sessionId ?? null);
  const current = sessionDetails(req);
  res.status(200).json({ sessions: sessions.map((session) => session.is_current ? {
    ...session,
    device_name: session.device_name ?? current.deviceName,
    browser_name: session.browser_name ?? current.browserName,
  } : session) });
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
