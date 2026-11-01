import { z } from "zod";

/** E.164: "+" then 8-15 digits, first digit non-zero. Covers +91 and every
 *  other country's mobile numbers — previously this was hardcoded to India
 *  only (`/^\+91[6-9]\d{9}$/`) across every portal's auth schema. */
export const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

export const phoneSchema = z.string().regex(PHONE_REGEX, "phone must be a valid international number, e.g. +14155552671");
