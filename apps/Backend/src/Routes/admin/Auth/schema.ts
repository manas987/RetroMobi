import { z } from "zod";
import { phoneSchema } from "../../../lib/phone";

export const SendOtpSchema = z.object({
  phone: phoneSchema,
});

export const VerifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, "code must be a 6-digit number"),
  deviceId: z.string().min(1),
});

// The Firebase SMS fallback: the ID token Firebase issued after it checked the code.
export const VerifyFirebaseOtpSchema = z.object({
  phone: phoneSchema,
  idToken: z.string().min(1),
  deviceId: z.string().min(1),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
  deviceId: z.string().min(1),
});

export const LogoutSchema = z.object({
  refreshToken: z.string().min(1),
});
