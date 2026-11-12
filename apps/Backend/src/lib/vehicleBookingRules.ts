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

export const PUBLIC_LISTING_ELIGIBLE = `
  v.status = 'ACTIVE' and v.deleted_at is null and s.deleted_at is null
  and v.verification_status = 'VERIFIED' and s.verification_status = 'VERIFIED'
  and ${CONFIRMED_RENTAL_LICENCE}
`;
