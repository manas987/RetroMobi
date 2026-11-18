export function pickupLicenceEnabled() {
  return process.env.PICKUP_LICENCE_FALLBACK === "true";
}

export const pickupLicenceRejections = [
  "LICENCE_INVALID", "LICENCE_EXPIRED", "STATUS_NOT_ACTIVE", "LEARNER_LICENCE", "REJECTED_ON_REVIEW",
];

export function isPickupLicenceOutage(session: {
  state?: string | null;
  rejection_code?: string | null;
  current?: boolean | null;
  known_ineligible?: boolean | null;
}) {
  return pickupLicenceEnabled() && session.current === true && !session.known_ineligible &&
    session.state === "MANUAL_REVIEW_REQUIRED" && session.rejection_code === "PROVIDER_OUTAGE";
}

export const PICKUP_LICENCE_ACK = "Bring the rider’s original, valid licence for this vehicle. If the shop can’t hand it over because the licence is missing or invalid, the usual cancellation charges apply.";

/**
 * Off for the beta: there is no registered company yet, so no KYC provider.
 * Customers declare instead (LICENCE_DECLARATION) and the shop checks the
 * original at pickup. "true" restores the online gate in lib/licenceGate.ts.
 */
export function onlineLicenceCheck() {
  return process.env.ONLINE_LICENCE_CHECK === "true";
}

export const LICENCE_DECLARATION = [
  "Every rider has a valid driving licence for the vehicle they are riding.",
  "I will bring the original licence to pickup. If the shop can't check it, the booking is cancelled: the deposit is refunded, the rental is not.",
];
