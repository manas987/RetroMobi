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
import { SmsDeliveryError } from "../providers/smsSender.ts";
import {
  BookingNotCancellableError,
  CouponInvalidError,
  ExtensionPendingError,
  InvalidDurationError,
  LicenceInvalidError,
  TooManyVehiclesError,
  VehicleUnavailableError,
} from "../Routes/user/Bookings/bookingsService.ts";
import { DistanceSortUnavailableError } from "../Routes/user/Search/searchService.ts";
import {
  DigilockerRequestNotFoundError,
  RiderHasActiveBookingError,
  RiderNotFoundError,
} from "../Routes/user/Riders/ridersService.ts";
import {
  AlreadyInspectedError,
  BookingNotFoundError,
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
  if (err instanceof SmsDeliveryError) {
    res.status(502).json({ error: "sms_delivery_failed", message: err.message });
    return;
  }
  if (err instanceof VehicleUnavailableError) {
    res.status(409).json({ error: "vehicle_unavailable", message: err.message });
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
  if (err instanceof BookingNotFoundError || err instanceof TicketNotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message });
    return;
  }
  if (err instanceof AlreadyInspectedError) {
    res.status(409).json({ error: "already_inspected", message: err.message });
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
