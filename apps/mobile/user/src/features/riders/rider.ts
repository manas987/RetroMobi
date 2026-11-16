import type { Row } from "@retromobi/mobile-shared";

export function licenceState(rider: Row, today: string) {
  if (rider.pickup_licence_available === true) return "CHECK_AT_PICKUP";
  if (!rider.licence_status && rider.verification_state === "MANUAL_REVIEW_REQUIRED") return "REVIEW_PENDING";
  return rider.licence_status === "VERIFIED" && typeof rider.licence_expires_on === "string" && rider.licence_expires_on < today
    ? "EXPIRED" : String(rider.licence_status ?? "UNVERIFIED");
}

export function canRide(rider: Row | undefined, returnDay: string): boolean {
  return rider?.licence_status === "VERIFIED" && typeof rider.licence_expires_on === "string" && rider.licence_expires_on >= returnDay;
}


export const pickupLicenceTerms = "Bring the rider’s original, valid licence for this vehicle. If the shop can’t hand it over because the licence is missing or invalid, the usual cancellation charges apply.";
