import {
  InsufficientWalletBalanceError,
  PayoutAccountNotReadyError,
  WithdrawalBelowMinimumError,
  WithdrawalNotFoundError,
  WithdrawalStateError,
} from "../lib/wallet.ts";
import type { NextFunction, Request, Response } from "express";
import {
  EmailNotVerifiedError,
  EmailTakenError,
  InvalidOtpError,
  InvalidSessionError,
  InvalidTicketError,
  PhoneTakenError,
  RateLimitedError,
} from "../Routes/user/Auth/authService.ts";
import { WhatsAppDeliveryError } from "../providers/whatsapp.ts";
import { PaymentsUnavailableError } from "../providers/cashfree.ts";
import { PaymentGroupNotFoundError } from "../Routes/user/Payments/paymentsService.ts";
import {
  BookingNotCancellableError,
  BookingNotExtendableError,
  CouponInvalidError,
  DuplicateRiderError,
  ExtensionPendingError,
  InvalidDurationError,
  LicenceInvalidError,
  LicenceReviewRequiredError,
  RiderUnavailableError,
  TooManyVehiclesError,
  VehicleUnavailableError,
} from "../Routes/user/Bookings/bookingsService.ts";
import { DistanceSortUnavailableError } from "../Routes/user/Search/searchService.ts";
import {
  DigilockerRequestNotFoundError,
  KycUnavailableError,
  RiderHasActiveBookingError,
  RiderNotFoundError,
} from "../Routes/user/Riders/ridersService.ts";
import {
  ConsentRequiredError,
  PhotoNotExpectedError,
  RetryLimitError,
  SessionNotFoundError,
  SessionNotPendingError,
} from "../Routes/user/Riders/verificationService.ts";
import { IllegalTransitionError } from "../lib/verificationStateMachine.ts";
import { NotReviewableError } from "../Routes/admin/Verification/verificationService.ts";
import {
  AlreadyCheckedError,
  BookingNotFoundError as IdentityBookingNotFoundError,
  IdentityCheckFailedError,
  IdentityCheckMissingError,
  VerificationRequiredError,
} from "../Routes/merchant/Operations/identityService.ts";
import {
  AlreadyInspectedError,
  BookingNotFoundError,
  BookingNotReturnableError,
  ClaimExceedsDepositError,
  WalkinClaimError,
} from "../Routes/user/Pickup/pickupService.ts";
import {
  TicketCategoryAlreadySetError,
  TicketNotAboutBookingError,
  TicketNotFoundError,
} from "../Routes/Tickets/ticketsService.ts";
import {
  DepositAlreadySettledError,
  DepositSplitMismatchError,
  TicketHasNoDepositError,
} from "../Routes/admin/Tickets/depositService.ts";
import {
  MerchantInvalidOtpError,
  MerchantInvalidSessionError,
  MerchantInvalidTicketError,
  MerchantPhoneTakenError,
  MerchantRateLimitedError,
  MerchantSuspendedError,
} from "../Routes/merchant/Auth/merchantAuthService.ts";
import {
  ShopHasActiveBookingsError,
  ShopNotFoundError,
} from "../Routes/merchant/Shops/shopsService.ts";
import {
  AlreadyMemberError,
  InviteAlreadyPendingError,
  InviteNotFoundError,
  LastOwnerError,
  MemberNotFoundError,
} from "../Routes/merchant/Members/membersService.ts";
import {
  DocumentNotFoundError,
  LicenceNotFoundError,
} from "../Routes/merchant/Licences/licencesService.ts";
import {
  ModelNotFoundError,
  RegistrationTakenError,
  TrackerAlreadyAssignedError,
  VehicleHasActiveBookingsError,
  VehicleNotFoundError,
} from "../Routes/merchant/Fleet/fleetService.ts";
import {
  PricingNotFoundError,
  SpecialPricingNotFoundError,
} from "../Routes/merchant/Pricing/pricingService.ts";
import {
  InvalidDurationError as WalkinInvalidDurationError,
  VehicleUnavailableError as WalkinVehicleUnavailableError,
  WalkinUnavailableError,
} from "../Routes/merchant/Operations/operationsService.ts";
import {
  AdminInvalidOtpError,
  AdminInvalidSessionError,
  AdminNotRecognizedError,
  AdminRateLimitedError,
} from "../Routes/admin/Auth/adminAuthService.ts";
import {
  AdminNotFoundError,
  LastSuperAdminError,
  PhoneOrEmailTakenError,
  SelfModificationError,
} from "../Routes/admin/Admins/adminsService.ts";
import { VerificationTargetNotFoundError } from "../Routes/admin/Verification/verificationService.ts";
import {
  AlreadyLinkedError,
  LinkNotFoundError,
} from "../Routes/admin/LicenceVehicles/licenceVehiclesService.ts";
import {
  ModelNotFoundError as AdminModelNotFoundError,
  ModelTakenError,
} from "../Routes/admin/Models/modelsService.ts";
import {
  CouponCodeTakenError,
  CouponInUseError,
  CouponNotFoundError as AdminCouponNotFoundError,
} from "../Routes/admin/Coupons/couponsService.ts";
import { MerchantNotFoundError as OversightMerchantNotFoundError } from "../Routes/admin/Oversight/oversightService.ts";
import {
  ReviewExistsError,
  ReviewNotAllowedError,
  ReviewNotFoundError,
} from "../Routes/user/Reviews/reviewsService.ts";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof RateLimitedError) {
    res.status(429).json({ error: "rate_limited", message: err.message });
    return;
  }
  if (err instanceof InvalidOtpError) {
    res.status(400).json({ error: "invalid_or_expired_otp", message: err.message });
    return;
  }
  if (err instanceof InvalidSessionError) {
    res.status(401).json({ error: "invalid_or_expired_session", message: err.message });
    return;
  }
  if (err instanceof InvalidTicketError) {
    res.status(401).json({ error: "invalid_or_expired_ticket", message: err.message });
    return;
  }
  if (err instanceof EmailNotVerifiedError) {
    res.status(400).json({ error: "email_not_verified", message: err.message });
    return;
  }
  if (err instanceof PhoneTakenError) {
    res.status(409).json({ error: "phone_taken", message: err.message });
    return;
  }
  if (err instanceof EmailTakenError) {
    res.status(409).json({ error: "email_taken", message: err.message });
    return;
  }
  // The client keys off `fallback` to retry the sign-in over Firebase SMS. Meta's
  // error body stays in the log, not the response.
  if (err instanceof WhatsAppDeliveryError) {
    console.error(err.message);
    res.status(502).json({ error: "otp_delivery_failed", fallback: "firebase", message: "We couldn't send the code on WhatsApp." });
    return;
  }
  if (err instanceof VehicleUnavailableError) {
    res.status(409).json({ error: "vehicle_unavailable", message: err.message });
    return;
  }
  if (err instanceof RiderUnavailableError) {
    res.status(409).json({ error: "rider_unavailable", message: err.message });
    return;
  }
  if (err instanceof DuplicateRiderError) {
    res.status(400).json({ error: "duplicate_rider", message: err.message });
    return;
  }
  if (err instanceof TooManyVehiclesError) {
    res.status(400).json({ error: "too_many_vehicles", message: err.message });
    return;
  }
  if (err instanceof InvalidDurationError) {
    res.status(400).json({ error: "invalid_duration", message: err.message });
    return;
  }
  if (err instanceof LicenceInvalidError) {
    res.status(400).json({ error: "licence_invalid", message: err.message });
    return;
  }
  // 409, not 400: the request is well-formed and the licence may be perfectly
  // good -- it is our evidence about it that is incomplete, and the resolution
  // is a review rather than a corrected field.
  if (err instanceof LicenceReviewRequiredError) {
    res.status(409).json({ error: "licence_review_required", message: err.message });
    return;
  }
  if (err instanceof WithdrawalBelowMinimumError || err instanceof InsufficientWalletBalanceError) {
    res.status(400).json({
      error: err instanceof WithdrawalBelowMinimumError ? "withdrawal_below_minimum" : "insufficient_wallet_balance",
      message: err.message,
    });
    return;
  }
  if (err instanceof WithdrawalNotFoundError) {
    res.status(404).json({ error: "withdrawal_not_found", message: err.message });
    return;
  }
  if (err instanceof WithdrawalStateError || err instanceof PayoutAccountNotReadyError) {
    res.status(409).json({
      error: err instanceof PayoutAccountNotReadyError ? "payout_account_not_ready" : "withdrawal_state",
      message: err.message,
    });
    return;
  }
  if (err instanceof CouponInvalidError) {
    res.status(400).json({ error: "coupon_invalid", message: err.message });
    return;
  }
  if (err instanceof DistanceSortUnavailableError) {
    res.status(400).json({ error: "distance_sort_unavailable", message: err.message });
    return;
  }
  if (err instanceof RiderNotFoundError) {
    res.status(404).json({ error: "rider_not_found", message: err.message });
    return;
  }
  if (err instanceof RiderHasActiveBookingError) {
    res.status(409).json({ error: "rider_has_active_booking", message: err.message });
    return;
  }
  if (err instanceof DigilockerRequestNotFoundError) {
    res.status(404).json({ error: "digilocker_request_not_found", message: err.message });
    return;
  }
  // 503, not 400: nothing is wrong with what the customer sent -- we just
  // cannot check it. Retryable, and never an approval.
  // 403: the request is fine and the caller is who they say -- the rider is
  // simply not cleared to take this vehicle.
  if (err instanceof VerificationRequiredError) {
    res.status(403).json({ error: "verification_required", message: err.message });
    return;
  }
  // 409: nothing is wrong with the request, a step is just missing. The
  // merchant records the identity check first, then the customer the vehicle.
  if (err instanceof IdentityCheckMissingError) {
    res.status(409).json({ error: "identity_check_missing", message: err.message });
    return;
  }
  if (err instanceof IdentityCheckFailedError) {
    res.status(422).json({ error: "identity_check_failed", message: err.message });
    return;
  }
  if (err instanceof AlreadyCheckedError) {
    res.status(409).json({ error: "identity_already_checked", message: err.message });
    return;
  }
  // 409: an admin tried to decide a session that is not awaiting a decision.
  // The transition table forbids approving a failed document, and this is that
  // refusal surfaced.
  if (err instanceof NotReviewableError) {
    res.status(409).json({ error: "not_reviewable", message: err.message });
    return;
  }
  if (err instanceof SessionNotFoundError) {
    // 404 and not 403: another account's session must be indistinguishable
    // from one that does not exist.
    res.status(404).json({ error: "verification_session_not_found", message: err.message });
    return;
  }
  if (err instanceof ConsentRequiredError) {
    res.status(400).json({ error: "consent_required", message: err.message });
    return;
  }
  // 409: the session has moved on -- a duplicate submit, or a redirect
  // replayed. The caller should read the status rather than retry blindly.
  if (err instanceof SessionNotPendingError || err instanceof PhotoNotExpectedError) {
    res.status(409).json({ error: "verification_session_state", message: err.message });
    return;
  }
  if (err instanceof IllegalTransitionError) {
    res.status(409).json({ error: "illegal_verification_transition", message: err.message });
    return;
  }
  if (err instanceof RetryLimitError) {
    res.status(429).json({ error: "verification_retry_limit", message: err.message });
    return;
  }
  if (err instanceof KycUnavailableError) {
    res.status(503).json({ error: "kyc_unavailable", message: err.message });
    return;
  }
  // 503, same reasoning as KYC: the request is fine, we just cannot reach the
  // payment gateway. Retryable, and never a confirmed booking.
  if (err instanceof PaymentGroupNotFoundError) {
    // 404 and not 403: another account's booking group must be
    // indistinguishable from one that does not exist.
    res.status(404).json({ error: "booking_group_not_found", message: err.message });
    return;
  }
  if (err instanceof PaymentsUnavailableError) {
    res.status(503).json({ error: "payments_unavailable", message: err.message });
    return;
  }
  if (err instanceof BookingNotFoundError || err instanceof IdentityBookingNotFoundError || err instanceof TicketNotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message });
    return;
  }
  if (err instanceof AlreadyInspectedError) {
    res.status(409).json({ error: "already_inspected", message: err.message });
    return;
  }
  if (err instanceof WalkinClaimError) {
    res.status(400).json({ error: "walkin_no_claim", message: err.message });
    return;
  }
  if (err instanceof ClaimExceedsDepositError) {
    res.status(400).json({ error: "claim_exceeds_deposit", message: err.message });
    return;
  }
  if (err instanceof BookingNotReturnableError) {
    res.status(409).json({ error: "booking_not_returnable", message: err.message });
    return;
  }
  if (err instanceof BookingNotCancellableError) {
    res.status(409).json({ error: "booking_not_cancellable", message: err.message });
    return;
  }
  if (err instanceof ExtensionPendingError) {
    res.status(409).json({ error: "extension_pending", message: err.message });
    return;
  }
  if (err instanceof BookingNotExtendableError) {
    res.status(409).json({ error: "booking_not_extendable", message: err.message });
    return;
  }
  if (err instanceof TicketCategoryAlreadySetError) {
    res.status(409).json({ error: "ticket_category_already_set", message: err.message });
    return;
  }
  if (err instanceof TicketNotAboutBookingError) {
    res.status(400).json({ error: "ticket_not_about_booking", message: err.message });
    return;
  }
  if (err instanceof TicketHasNoDepositError) {
    res.status(400).json({ error: "ticket_has_no_deposit", message: err.message });
    return;
  }
  if (err instanceof DepositAlreadySettledError) {
    res.status(409).json({ error: "deposit_already_settled", message: err.message });
    return;
  }
  if (err instanceof DepositSplitMismatchError) {
    res.status(400).json({ error: "deposit_split_mismatch", message: err.message });
    return;
  }
  if (err instanceof MerchantRateLimitedError) {
    res.status(429).json({ error: "rate_limited", message: err.message });
    return;
  }
  if (err instanceof MerchantInvalidOtpError) {
    res.status(400).json({ error: "invalid_or_expired_otp", message: err.message });
    return;
  }
  if (err instanceof MerchantInvalidSessionError) {
    res.status(401).json({ error: "invalid_or_expired_session", message: err.message });
    return;
  }
  if (err instanceof MerchantInvalidTicketError) {
    res.status(401).json({ error: "invalid_or_expired_ticket", message: err.message });
    return;
  }
  if (err instanceof MerchantPhoneTakenError) {
    res.status(409).json({ error: "phone_taken", message: err.message });
    return;
  }
  if (err instanceof MerchantSuspendedError) {
    res.status(403).json({ error: "merchant_suspended", message: err.message });
    return;
  }
  if (err instanceof ShopNotFoundError) {
    res.status(404).json({ error: "shop_not_found", message: err.message });
    return;
  }
  if (err instanceof ShopHasActiveBookingsError) {
    res.status(409).json({ error: "shop_has_active_bookings", message: err.message });
    return;
  }
  if (err instanceof MemberNotFoundError || err instanceof InviteNotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message });
    return;
  }
  if (err instanceof AlreadyMemberError) {
    res.status(409).json({ error: "already_member", message: err.message });
    return;
  }
  if (err instanceof InviteAlreadyPendingError) {
    res.status(409).json({ error: "invite_already_pending", message: err.message });
    return;
  }
  if (err instanceof LastOwnerError) {
    res.status(409).json({ error: "last_owner", message: err.message });
    return;
  }
  if (err instanceof LicenceNotFoundError || err instanceof DocumentNotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message });
    return;
  }
  if (err instanceof VehicleNotFoundError || err instanceof ModelNotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message });
    return;
  }
  if (err instanceof VehicleHasActiveBookingsError) {
    res.status(409).json({ error: "vehicle_has_active_bookings", message: err.message });
    return;
  }
  if (err instanceof RegistrationTakenError) {
    res.status(409).json({ error: "registration_taken", message: err.message });
    return;
  }
  if (err instanceof TrackerAlreadyAssignedError) {
    res.status(409).json({ error: "tracker_already_assigned", message: err.message });
    return;
  }
  if (err instanceof PricingNotFoundError || err instanceof SpecialPricingNotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message });
    return;
  }
  if (err instanceof WalkinUnavailableError || err instanceof WalkinVehicleUnavailableError) {
    res.status(409).json({ error: "vehicle_unavailable", message: err.message });
    return;
  }
  if (err instanceof WalkinInvalidDurationError) {
    res.status(400).json({ error: "invalid_duration", message: err.message });
    return;
  }
  if (err instanceof AdminRateLimitedError) {
    res.status(429).json({ error: "rate_limited", message: err.message });
    return;
  }
  if (err instanceof AdminInvalidOtpError) {
    res.status(400).json({ error: "invalid_or_expired_otp", message: err.message });
    return;
  }
  if (err instanceof AdminInvalidSessionError) {
    res.status(401).json({ error: "invalid_or_expired_session", message: err.message });
    return;
  }
  if (err instanceof AdminNotRecognizedError) {
    res.status(401).json({ error: "admin_not_recognized", message: err.message });
    return;
  }
  if (err instanceof AdminNotFoundError) {
    res.status(404).json({ error: "admin_not_found", message: err.message });
    return;
  }
  if (err instanceof SelfModificationError) {
    res.status(409).json({ error: "self_modification_forbidden", message: err.message });
    return;
  }
  if (err instanceof LastSuperAdminError) {
    res.status(409).json({ error: "last_super_admin", message: err.message });
    return;
  }
  if (err instanceof PhoneOrEmailTakenError) {
    res.status(409).json({ error: "phone_or_email_taken", message: err.message });
    return;
  }
  if (err instanceof VerificationTargetNotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message });
    return;
  }
  if (err instanceof LinkNotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message });
    return;
  }
  if (err instanceof AlreadyLinkedError) {
    res.status(409).json({ error: "already_linked", message: err.message });
    return;
  }
  if (err instanceof AdminModelNotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message });
    return;
  }
  if (err instanceof ModelTakenError) {
    res.status(409).json({ error: "model_taken", message: err.message });
    return;
  }
  if (err instanceof AdminCouponNotFoundError) {
    res.status(404).json({ error: "coupon_not_found", message: err.message });
    return;
  }
  if (err instanceof CouponCodeTakenError) {
    res.status(409).json({ error: "coupon_code_taken", message: err.message });
    return;
  }
  if (err instanceof CouponInUseError) {
    res.status(409).json({ error: "coupon_in_use", message: err.message });
    return;
  }
  if (err instanceof OversightMerchantNotFoundError) {
    res.status(404).json({ error: "merchant_not_found", message: err.message });
    return;
  }
  if (err instanceof ReviewNotAllowedError) {
    res.status(400).json({ error: "review_not_allowed", message: err.message });
    return;
  }
  if (err instanceof ReviewExistsError) {
    res.status(409).json({ error: "review_exists", message: err.message });
    return;
  }
  if (err instanceof ReviewNotFoundError) {
    res.status(404).json({ error: "review_not_found", message: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "internal_error" });
}
