import type { Pool } from "pg";
import { PUBLIC_LISTING_ELIGIBLE, VEHICLE_LICENCE_JOIN } from "../../../lib/vehicleBookingRules.ts";
import { ShopNotFoundError } from "../../merchant/Shops/shopsService.ts";

export interface ShopHours {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}

export interface ShopLicence {
  licenceNumber: string;
  issuingAuthority: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
}

export interface ShopProfile {
  shopId: string;
  name: string;
  /** The licence holder's name — the licence is issued to a person, not the shop, so the page has to be able to say who. */
  ownerName: string | null;
  phone: string | null;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  /** OPEN / CLOSED, the merchant's own switch — not the verification state. */
  status: string;
  rating: number | null;
  reviewCount: number;
  memberSince: string;
  hours: ShopHours[];
  /** ACTIVE Rent-a-Motorcycle licences covering this branch. Empty is a real state, not an error. */
  licences: ShopLicence[];
  /** Distinct body types this shop currently has listed, for the page's at-a-glance summary. */
  bodyTypes: string[];
}

/**
 * Public, unauthenticated shop profile — browsing is anonymous, so this is
 * deliberately only what a shop would print on its own signboard: no email,
 * no GSTIN, no merchant user id, no verification queue state.
 */
export async function getShopProfile(pool: Pool, shopId: string): Promise<ShopProfile> {
  const { rows } = await pool.query(
    `select s.id, s.name, s.phone, s.address_line1, s.city, s.state, s.pincode,
            s.latitude, s.longitude, s.status, s.rating, s.review_count, s.created_at,
            mu.name as owner_name
       from shops s
       join merchant_users mu on mu.id = s.merchant_user_id
      where s.id = $1 and s.deleted_at is null`,
    [shopId],
  );
  const shop = rows[0];
  if (!shop) throw new ShopNotFoundError("shop not found");

  const [hours, licences, bodyTypes] = await Promise.all([
    pool.query(
      `select day_of_week, opens_at, closes_at from shop_hours
        where shop_id = $1 order by day_of_week`,
      [shopId],
    ),
    pool.query(
      `select sl.licence_number, sl.issuing_authority, sl.issued_at, sl.expires_at
         from license_shops ls
         join shop_licenses sl on sl.id = ls.license_id
        where ls.shop_id = $1 and sl.status = 'ACTIVE' and sl.deleted_at is null
        order by sl.expires_at nulls last`,
      [shopId],
    ),
    pool.query(
      `select distinct m.body_type
         from vehicles v
         join shops s on s.id = v.shop_id
         join vehicle_models m on m.id = v.model_id
         join vehicle_pricing vp on vp.vehicle_id = v.id
         ${VEHICLE_LICENCE_JOIN}
        where v.shop_id = $1 and ${PUBLIC_LISTING_ELIGIBLE}
          and m.body_type is not null
        order by m.body_type`,
      [shopId, null, null],
    ),
  ]);

  return {
    shopId: shop.id,
    name: shop.name,
    ownerName: shop.owner_name,
    phone: shop.phone,
    addressLine1: shop.address_line1,
    city: shop.city,
    state: shop.state,
    pincode: shop.pincode,
    latitude: shop.latitude,
    longitude: shop.longitude,
    status: shop.status,
    rating: shop.rating != null ? Number(shop.rating) : null,
    reviewCount: shop.review_count,
    memberSince: shop.created_at,
    hours: hours.rows.map((h) => ({
      dayOfWeek: h.day_of_week,
      opensAt: h.opens_at,
      closesAt: h.closes_at,
    })),
    licences: licences.rows.map((l) => ({
      licenceNumber: l.licence_number,
      issuingAuthority: l.issuing_authority,
      issuedAt: l.issued_at,
      expiresAt: l.expires_at,
    })),
    bodyTypes: bodyTypes.rows.map((b) => b.body_type),
  };
}
