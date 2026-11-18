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

export const EmailOtpSendSchema = z.object({
  signupTicket: z.string().min(1),
  email: z.string().email(),
});

export const EmailOtpVerifySchema = z.object({
  signupTicket: z.string().min(1),
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, "code must be a 6-digit number"),
});

// Email is optional: send emailVerificationTicket only if the customer
// verified one.
export const SignupCompleteSchema = z.object({
  signupTicket: z.string().min(1),
  deviceId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  email: z.string().email().optional(),
  emailVerificationTicket: z.string().min(1).optional(),
});

export const UpdateAccountSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const AccountEmailSendSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const AccountEmailVerifySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().regex(/^\d{6}$/, "code must be a 6-digit number"),
});
