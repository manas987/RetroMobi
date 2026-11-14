import type { Pool } from "pg";

// Shared by public listings and online booking holds. $2/$3 are the rental window.
export const VEHICLE_LICENCE_JOIN = `
  left join license_vehicles lv on lv.vehicle_id = v.id and lv.removed_at is null
  left join shop_licenses sl on sl.id = lv.license_id
    and sl.merchant_user_id = s.merchant_user_id and sl.deleted_at is null
`;

export const CONFIRMED_RENTAL_LICENCE = `coalesce(
  sl.status = 'ACTIVE'
  and (sl.expires_at is null or sl.expires_at >= (greatest(now(), $2::timestamptz, $3::timestamptz) at time zone 'Asia/Kolkata')::date),
  false
)`;

const PETROL_DOCS = ["RC", "INSURANCE", "PERMIT", "PUC", "FITNESS", "TAX"] as const;
const ELECTRIC_DOCS = ["RC", "INSURANCE", "FITNESS", "TAX"] as const;

/** Every vehicle paper type, in display order. The setup response reports all of them. */
export const ALL_VEHICLE_DOCS = PETROL_DOCS;

/**
 * Papers a vehicle must have (uploaded, not rejected, not expired) before it can
 * be submitted for checking. A battery vehicle needs no pollution certificate
 * and no rental permit. An unknown fuel type is treated as petrol.
 * Read by the setup checklist (Routes/merchant/Setup); change it here only.
 */
export function requiredVehicleDocs(fuelType: string | null | undefined): readonly string[] {
  return fuelType === "ELECTRIC" ? ELECTRIC_DOCS : PETROL_DOCS;
}

/** Per-shop papers a shop must have before it can be submitted. LANDLORD_NOC stays optional. */
export const REQUIRED_SHOP_DOCS = ["SHOP_ACT", "PREMISES"] as const;
/** Business-wide papers (merchant_documents.type) needed before a shop can be submitted. */
export const REQUIRED_BUSINESS_DOCS = ["BUSINESS_REG", "PAN"] as const;

/** README para 5(v): a rental shop needs this many compliant vehicles to be approved. */
export const MIN_VEHICLES_FOR_SHOP = 5;

export const PUBLIC_LISTING_ELIGIBLE = `
  v.status = 'ACTIVE' and v.deleted_at is null and s.deleted_at is null
  and v.verification_status = 'VERIFIED' and s.verification_status = 'VERIFIED'
  and ${CONFIRMED_RENTAL_LICENCE}
`;

/**
 * No merchant-declared block (servicing, a bike lent out off-platform) overlapping
 * the window. $2/$3 are the window, same as everything else in this file.
 *
 * One definition, three callers -- search, the booking hold and the extension gate.
 * It was duplicated across the first and third, and simply absent from the second:
 * the exclusion constraint arbitrates booking-vs-booking only, so nothing stopped a
 * hold on a vehicle its own shop had taken off the road.
 */
export const notBlocked = (vehicleCol: string) => `not exists (
  select 1 from vehicle_unavailability u where u.vehicle_id = ${vehicleCol}
    and tstzrange(u.start_at, u.end_at) && tstzrange($2::timestamptz, $3::timestamptz)
)`;

export async function extensionWindowAvailable(
  db: Pick<Pool, "query">, bookingId: string, oldReturnAt: Date, newReturnAt: Date,
): Promise<boolean> {
  const { rows } = await db.query(
    `select 1 from bookings b
      where b.id = $1 and b.status = 'CONFIRMED' and b.deleted_at is null
        and b.actual_pickup_at is not null and b.actual_return_at is null
        and b.scheduled_return_at = $2::timestamptz
        and not exists (
          select 1 from bookings other where other.id <> b.id and other.deleted_at is null
            and (other.vehicle_id = b.vehicle_id or other.rider_id = b.rider_id)
            and tstzrange(other.scheduled_pickup_at, other.scheduled_return_at) && tstzrange($2::timestamptz, $3::timestamptz)
        )
        and ${notBlocked("b.vehicle_id")}`,
    [bookingId, oldReturnAt, newReturnAt],
  );
  return rows.length > 0;
}
