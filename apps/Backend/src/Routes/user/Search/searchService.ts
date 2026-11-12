import type { Pool } from "pg";
import { priceRental } from "../../../lib/pricing.ts";
import { CONFIRMED_RENTAL_LICENCE, notBlocked, PUBLIC_LISTING_ELIGIBLE, VEHICLE_LICENCE_JOIN } from "../../../lib/vehicleBookingRules.ts";

export class DistanceSortUnavailableError extends Error {}
export class VehicleNotFoundError extends Error {}

export interface Licence {
  licenceNumber: string;
  issuingAuthority: string | null;
  validUntil: string | null;
}

export interface SearchOffer {
  vehicleId: string;
  shopId: string;
  shopName: string;
  shopPhone: string | null;
  shopAddress: string;
  shopLatitude: number | null;
  shopLongitude: number | null;
  pricePerDay: number;
  totalAmount: number;
  securityDeposit: number;
  rating: number | null;
  reviewCount: number;
  distanceKm: number | null;
  licence: Licence | null;
  badges: { shop: string; vehicle: string };
}

export interface SearchResult {
  model: {
    id: string;
    make: string;
    model: string;
    imageKey: string | null;
    fuelType: "PETROL" | "ELECTRIC" | null;
    engineCc: number | null;
    bodyType: string | null;
    seatingCapacity: number | null;
  };
  primaryOffer: SearchOffer;
  offerCount: number;
  /** vehicleIds of every available unit of this model at this shop, ranked same as offerCount's group. */
  offerVehicleIds: string[];
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

const WINDOW_UNBOOKED = `not exists (
  select 1 from bookings b where b.vehicle_id = v.id and b.deleted_at is null
    and tstzrange(b.scheduled_pickup_at, b.scheduled_return_at) && tstzrange($2::timestamptz, $3::timestamptz)
)`;

const DATES_AVAILABLE = `${WINDOW_UNBOOKED} and ${notBlocked("v.id")}`;

const vehicleRowSelect = (extra = "") => `
  select v.id as vehicle_id, v.shop_id, v.model_id,
         s.name as shop_name, s.phone as shop_phone, s.address_line1, s.city as shop_city,
         s.rating, s.review_count, s.latitude, s.longitude,
         vp.id as pricing_id, vp.amount, vp.weekend_amount, vp.security_deposit_amount, vp.late_fee_amount,
         m.make, m.model, m.image_key, m.fuel_type, m.engine_cc, m.body_type, m.seating_capacity,
         case when ${CONFIRMED_RENTAL_LICENCE} then sl.licence_number end as licence_number,
         sl.issuing_authority, sl.expires_at::text as licence_expires_at ${extra}
    from vehicles v
    join vehicle_pricing vp on vp.vehicle_id = v.id
    join shops s on s.id = v.shop_id
    join vehicle_models m on m.id = v.model_id
    ${VEHICLE_LICENCE_JOIN}
`;

function toLicence(row: any): Licence | null {
  if (row.licence_number == null) return null;
  return {
    licenceNumber: row.licence_number,
    issuingAuthority: row.issuing_authority,
    validUntil: row.licence_expires_at ?? null,
  };
}

export async function searchVehicles(
  pool: Pool,
  params: {
    /** required unless shopId is given */
    city?: string;
    /** scopes results to one shop's inventory, ignoring city (used by the shop page) */
    shopId?: string;
    pickupAt: Date;
    returnAt: Date;
    lat?: number;
    lng?: number;
    minPrice?: number;
    maxPrice?: number;
    modelId?: string;
    /** comma-separated list of brand names — any match passes */
    make?: string;
    minRating?: number;
    maxDistanceKm?: number;
    /** comma-separated list of "PETROL"/"ELECTRIC" — any match passes */
    fuelType?: string;
    /** comma-separated list of body types, e.g. "SCOOTER,MOTORCYCLE" — any match passes */
    bodyType?: string;
    minEngineCc?: number;
    maxEngineCc?: number;
    seatingCapacity?: number;
    sort?: "price" | "rating" | "distance";
    page?: number;
    limit?: number;
  },
): Promise<{ results: SearchResult[]; total: number; priceHistogram: number[] }> {
  const sort = params.sort ?? "price";
  if (sort === "distance" && (params.lat == null || params.lng == null)) {
    throw new DistanceSortUnavailableError();
  }

  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);

  const makeFilter = params.make ? new Set(params.make.split(",")) : null;
  const fuelTypeFilter = params.fuelType ? new Set(params.fuelType.split(",")) : null;
  const bodyTypeFilter = params.bodyType ? new Set(params.bodyType.split(",")) : null;

  // The box is a pre-filter for an explicit distance *filter*, not a side
  // effect of merely knowing the viewer's coordinates — lat/lng alone are
  // also sent just to label results with "X km away" or to sort by
  // distance, and silently shrinking the result set to ~22km of wherever
  // the browser's geolocation resolved to (which may be inaccurate, or
  // simply far from the city being searched) would hide real results for
  // no reason the user asked for.
  const boxActive = params.lat != null && params.lng != null && params.maxDistanceKm != null;
  const boxClause = boxActive ? `and s.latitude between $4 and $5 and s.longitude between $6 and $7` : "";
  const boxValues = boxActive
    ? [params.lat! - 0.2, params.lat! + 0.2, params.lng! - 0.2, params.lng! + 0.2]
    : [];

  // $1 must stay referenced even when shopId-scoped (city passed as null) —
  // an unreferenced placeholder leaves Postgres unable to infer its type.
  const cityClause = params.shopId
    ? `and ($1::text is null or lower(s.city) = lower($1::text))`
    : `and lower(s.city) = lower($1::text)`;
  const shopClause = params.shopId ? `and v.shop_id = $${4 + boxValues.length}::uuid` : "";
  const shopValues = params.shopId ? [params.shopId] : [];

  const { rows } = await pool.query(
    `${vehicleRowSelect()}
      where ${PUBLIC_LISTING_ELIGIBLE}
        ${cityClause}
        ${boxClause}
        ${shopClause}
        and ${DATES_AVAILABLE}`,
    [params.city ?? null, params.pickupAt, params.returnAt, ...boxValues, ...shopValues],
  );

  if (rows.length === 0) return { results: [], total: 0, priceHistogram: [] };

  const pricingIds: string[] = rows.map((r) => r.pricing_id);
  const { rows: specialRows } = await pool.query(
    `select vehicle_pricing_id, amount, weekend_amount, effective_from::text, effective_until::text
       from special_pricings
      where vehicle_pricing_id = any($1) and deleted_at is null order by created_at, id`,
    [pricingIds],
  );
  const specialsByPricing = new Map<string, typeof specialRows>();
  for (const s of specialRows) {
    const list = specialsByPricing.get(s.vehicle_pricing_id) ?? [];
    list.push(s);
    specialsByPricing.set(s.vehicle_pricing_id, list);
  }

  type Candidate = SearchOffer & {
    modelId: string;
    make: string;
    modelName: string;
    imageKey: string | null;
    fuelType: "PETROL" | "ELECTRIC" | null;
    engineCc: number | null;
    bodyType: string | null;
    seatingCapacity: number | null;
  };
  const candidates: Candidate[] = [];
  /** pricePerDay (paise) of every vehicle matching every filter except price. */
  const priceHistogram: number[] = [];

  for (const row of rows) {
    const specials = (specialsByPricing.get(row.pricing_id) ?? []).map((s) => ({
      amount: Number(s.amount),
      weekendAmount: Number(s.weekend_amount),
      effectiveFrom: s.effective_from,
      effectiveUntil: s.effective_until,
    }));

    const { days, rentalAmount } = priceRental({
      pickupAt: params.pickupAt,
      returnAt: params.returnAt,
      pricing: {
        amount: Number(row.amount),
        weekendAmount: Number(row.weekend_amount),
        securityDepositAmount: Number(row.security_deposit_amount),
      },
      specialPricings: specials,
    });

    let distanceKm: number | null = null;
    if (params.lat != null && params.lng != null && row.latitude != null && row.longitude != null) {
      distanceKm = haversineKm(params.lat, params.lng, row.latitude, row.longitude);
    }

    const licence = toLicence(row);

    // Every filter except price, applied first — priceHistogram below is
    // built from this pre-price-filter set, so the price slider can always
    // show the full distribution, including what a committed filter hides.
    if (params.modelId != null && row.model_id !== params.modelId) continue;
    if (makeFilter != null && !makeFilter.has(row.make)) continue;
    if (params.minRating != null && (row.rating == null || Number(row.rating) < params.minRating)) continue;
    if (params.maxDistanceKm != null && (distanceKm == null || distanceKm > params.maxDistanceKm)) continue;
    if (fuelTypeFilter != null && !fuelTypeFilter.has(row.fuel_type)) continue;
    if (bodyTypeFilter != null && !bodyTypeFilter.has(row.body_type)) continue;
    if (params.minEngineCc != null && (row.engine_cc == null || row.engine_cc < params.minEngineCc)) continue;
    if (params.maxEngineCc != null && (row.engine_cc == null || row.engine_cc > params.maxEngineCc)) continue;
    if (params.seatingCapacity != null && row.seating_capacity !== params.seatingCapacity) continue;

    priceHistogram.push(days[0]!.amount);

    if (params.minPrice != null && rentalAmount < params.minPrice) continue;
    if (params.maxPrice != null && rentalAmount > params.maxPrice) continue;

    candidates.push({
      vehicleId: row.vehicle_id,
      shopId: row.shop_id,
      shopName: row.shop_name,
      shopPhone: row.shop_phone,
      shopAddress: `${row.address_line1}, ${row.shop_city}`,
      shopLatitude: row.latitude,
      shopLongitude: row.longitude,
      pricePerDay: days[0]!.amount,
      totalAmount: rentalAmount,
      securityDeposit: Number(row.security_deposit_amount),
      rating: row.rating != null ? Number(row.rating) : null,
      reviewCount: row.review_count ?? 0,
      distanceKm,
      licence,
      badges: { shop: "", vehicle: "" },
      modelId: row.model_id,
      make: row.make,
      modelName: row.model,
      imageKey: row.image_key,
      fuelType: row.fuel_type,
      engineCc: row.engine_cc,
      bodyType: row.body_type,
      seatingCapacity: row.seating_capacity,
    });
  }

  // Keyed by model+shop, not model alone — otherwise shop A's 10 Activa 4Gs
  // and shop B's 10 Activa 4Gs collapse into one card and 9 shops vanish.
  const byModelShop = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = `${c.modelId}:${c.shopId}`;
    const list = byModelShop.get(key) ?? [];
    list.push(c);
    byModelShop.set(key, list);
  }

  function rank(a: Candidate, b: Candidate): number {
    if (sort === "price") return a.totalAmount - b.totalAmount;
    if (sort === "rating") return (b.rating ?? -1) - (a.rating ?? -1);
    return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
  }

  let results: SearchResult[] = [];
  for (const offers of byModelShop.values()) {
    offers.sort(rank);
    const primary = offers[0]!;
    results.push({
      model: {
        id: primary.modelId,
        make: primary.make,
        model: primary.modelName,
        imageKey: primary.imageKey,
        fuelType: primary.fuelType,
        engineCc: primary.engineCc,
        bodyType: primary.bodyType,
        seatingCapacity: primary.seatingCapacity,
      },
      primaryOffer: {
        vehicleId: primary.vehicleId,
        shopId: primary.shopId,
        shopName: primary.shopName,
        shopPhone: primary.shopPhone,
        shopAddress: primary.shopAddress,
        shopLatitude: primary.shopLatitude,
        shopLongitude: primary.shopLongitude,
        pricePerDay: primary.pricePerDay,
        totalAmount: primary.totalAmount,
        securityDeposit: primary.securityDeposit,
        rating: primary.rating,
        reviewCount: primary.reviewCount,
        distanceKm: primary.distanceKm,
        licence: primary.licence,
        badges: primary.badges,
      },
      offerCount: offers.length,
      offerVehicleIds: offers.map((o) => o.vehicleId),
    });
  }

  results.sort((a, b) => rank(a.primaryOffer as Candidate, b.primaryOffer as Candidate));

  const total = results.length;
  const start = (page - 1) * limit;
  results = results.slice(start, start + limit);

  return { results, total, priceHistogram };
}

export interface VehicleDetail {
  vehicleId: string;
  photoKeys: string[];
  accessories: { type: string; quantity: number }[];
  modelId: string;
  make: string;
  model: string;
  imageKey: string | null;
  fuelType: "PETROL" | "ELECTRIC" | null;
  engineCc: number | null;
  bodyType: string | null;
  seatingCapacity: number | null;
  shopId: string;
  shopName: string;
  shopPhone: string | null;
  shopAddress: string;
  shopLatitude: number | null;
  shopLongitude: number | null;
  rating: number | null;
  reviewCount: number;
  amount: number;
  weekendAmount: number;
  securityDeposit: number;
  lateFeeAmount: number;
  licence: Licence | null;
  listingEligible: boolean;
  datesAvailable: boolean | null;
  quote: { pricePerDay: number; rentalAmount: number } | null;
}

/** A single vehicle's full listing detail, independent of any search window. */
export async function getVehicleDetail(pool: Pool, vehicleId: string, window?: { pickupAt: Date; returnAt: Date }): Promise<VehicleDetail> {
  const { rows } = await pool.query(
    `${vehicleRowSelect(`, (${PUBLIC_LISTING_ELIGIBLE}) as listing_eligible,
      case when $2::timestamptz is not null and $3::timestamptz is not null
        then ${DATES_AVAILABLE} end as dates_available,
      array(select vm.storage_key from vehicle_media vm
        where vm.vehicle_id = v.id and vm.published and vm.deleted_at is null
        order by vm.display_order, vm.created_at, vm.id) as photo_keys,
      coalesce((select json_agg(json_build_object('type', a.type, 'quantity', a.quantity) order by a.type)
        from vehicle_accessories a where a.vehicle_id = v.id and a.status = 'AVAILABLE' and a.quantity > 0),
        '[]'::json) as accessories`)}
      where v.id = $1 and v.deleted_at is null and s.deleted_at is null`,
    [vehicleId, window?.pickupAt ?? null, window?.returnAt ?? null],
  );
  const row = rows[0];
  if (!row) throw new VehicleNotFoundError();

  let quote: VehicleDetail["quote"] = null;
  if (window && row.listing_eligible) {
    const { rows: specials } = await pool.query(
      `select amount, weekend_amount, effective_from::text, effective_until::text
         from special_pricings where vehicle_pricing_id = $1 and deleted_at is null order by created_at, id`,
      [row.pricing_id],
    );
    const { days, rentalAmount } = priceRental({
      ...window,
      pricing: { amount: Number(row.amount), weekendAmount: Number(row.weekend_amount), securityDepositAmount: Number(row.security_deposit_amount) },
      specialPricings: specials.map((special) => ({
        amount: Number(special.amount), weekendAmount: Number(special.weekend_amount),
        effectiveFrom: special.effective_from, effectiveUntil: special.effective_until,
      })),
    });
    quote = { pricePerDay: days[0]!.amount, rentalAmount };
  }

  return {
    vehicleId: row.vehicle_id,
    photoKeys: row.listing_eligible ? row.photo_keys : [],
    accessories: row.accessories,
    modelId: row.model_id,
    make: row.make,
    model: row.model,
    imageKey: row.image_key,
    fuelType: row.fuel_type,
    engineCc: row.engine_cc,
    bodyType: row.body_type,
    seatingCapacity: row.seating_capacity,
    shopId: row.shop_id,
    shopName: row.shop_name,
    shopPhone: row.shop_phone,
    shopAddress: `${row.address_line1}, ${row.shop_city}`,
    shopLatitude: row.latitude,
    shopLongitude: row.longitude,
    rating: row.rating != null ? Number(row.rating) : null,
    reviewCount: row.review_count ?? 0,
    amount: Number(row.amount),
    weekendAmount: Number(row.weekend_amount),
    securityDeposit: Number(row.security_deposit_amount),
    lateFeeAmount: Number(row.late_fee_amount),
    licence: toLicence(row),
    listingEligible: row.listing_eligible,
    datesAvailable: row.dates_available,
    quote,
  };
}

/**
 * Which of these vehicles can no longer be booked for their window.
 *
 * Backs the cart prune: the cart lives in localStorage, so it routinely holds ids
 * that were bookable when they were added and are not now -- taken off the road for
 * servicing, unlisted, their shop's licence lapsed, or simply booked by someone else.
 * Silently dropping them beats a 409 at checkout, and `createHold` enforces the same
 * rules regardless, so this is UX and never the authority.
 *
 * Deliberately returns only the unavailable ids: an empty array is the common case
 * and means "nothing to do".
 */
export async function findUnavailableVehicles(
  pool: Pool,
  lines: Array<{ vehicleIds: string[]; pickupAt: Date; returnAt: Date }>,
): Promise<string[]> {
  const unavailable: string[] = [];

  for (const line of lines) {
    if (line.vehicleIds.length === 0) continue;
    const { rows } = await pool.query(
      `select v.id from vehicles v join shops s on s.id = v.shop_id
        ${VEHICLE_LICENCE_JOIN}
       where v.id = any($1::uuid[]) and ${PUBLIC_LISTING_ELIGIBLE} and ${DATES_AVAILABLE}`,
      [line.vehicleIds, line.pickupAt, line.returnAt],
    );
    const stillGood = new Set(rows.map((r) => r.id as string));
    for (const id of line.vehicleIds) if (!stillGood.has(id)) unavailable.push(id);
  }

  return [...new Set(unavailable)];
}
