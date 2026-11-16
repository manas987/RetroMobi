export type SessionState = typeof states[number];
const states = ["CONSENT_PENDING", "DOCUMENT_PENDING", "DOCUMENT_VERIFIED", "DOCUMENT_FAILED", "PHOTO_PENDING", "MANUAL_REVIEW_REQUIRED", "VERIFIED", "REJECTED", "EXPIRED", "REVOKED"] as const;
export function verificationState(value: unknown): SessionState {
  const result = states.find((state) => state === value);
  if (!result) throw new Error("Unrecognised licence check status.");
  return result;
}
export const REJECTION_COPY: Record<string, string> = {
  LICENCE_NOT_FOUND:
    "The transport department has no record of that licence number with that date of birth. Check both and try again.",
  LICENCE_INVALID: "That licence came back as not valid. Check the number and your date of birth.",
  LICENCE_EXPIRED: "That licence has expired. You'll need to renew it before renting.",
  STATUS_NOT_ACTIVE:
    "That licence is recorded as suspended or cancelled, so we can't rent against it.",
  LEARNER_LICENCE: "Learner's licences can't be used to rent — we need a full licence.",
  CONSENT_DENIED: "DigiLocker consent wasn't given, so nothing was shared. You can try again.",
  CONSENT_EXPIRED: "That DigiLocker request timed out. Start again when you're ready.",
  PROVIDER_UNAVAILABLE:
    "We couldn't reach the licence check just now, so a person will review this instead. Nothing more is needed from you.",
  DOCUMENT_UNAVAILABLE:
    "DigiLocker didn't return your licence. A person will review this instead.",
  DOCUMENT_UNREADABLE:
    "We couldn't read the document DigiLocker sent. A person will review this instead.",
  CANCELLED: "You cancelled this check. Start again whenever you like.",
};

export function copyFor(code: string | undefined, fallback: string): string {
  return (code && REJECTION_COPY[code]) || fallback;
}

