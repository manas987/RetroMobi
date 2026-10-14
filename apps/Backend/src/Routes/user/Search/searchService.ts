import type { Pool } from "pg";
import { priceRental } from "../../../lib/pricing.ts";

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

const VEHICLE_ROW_SELECT = `
  select v.id as vehicle_id, v.shop_id, v.model_id,
         s.name as shop_name, s.phone as shop_phone, s.address_line1, s.city as shop_city,
         s.rating, s.review_count, s.latitude, s.longitude,
         vp.id as pricing_id, vp.amount, vp.weekend_amount, vp.security_deposit_amount, vp.late_fee_amount,
         m.make, m.model, m.image_key, m.fuel_type, m.engine_cc, m.body_type, m.seating_capacity,
         sl.licence_number, sl.issuing_authority, sl.expires_at as licence_expires_at
    from vehicles v
    join vehicle_pricing vp on vp.vehicle_id = v.id
    join shops s on s.id = v.shop_id
    join vehicle_models m on m.id = v.model_id
    left join license_vehicles lv on lv.vehicle_id = v.id and lv.removed_at is null
    left join shop_licenses sl on sl.id = lv.license_id and sl.status = 'ACTIVE' and sl.deleted_at is null
`;

function toLicence(row: any): Licence | null {
  if (row.licence_number == null) return null;
  return {
    licenceNumber: row.licence_number,
    issuingAuthority: row.issuing_authority,
    validUntil: row.licence_expires_at ? row.licence_expires_at.toISOString().slice(0, 10) : null,
  };
}

export async function searchVehicles(
  pool: Pool,
  params: {
    city: string;
    pickupAt: Date;
    returnAt: Date;
    lat?: number;
    lng?: number;
    minPrice?: number;
    maxPrice?: number;
    modelId?: string;
    minRating?: number;
    maxDistanceKm?: number;
    fuelType?: "PETROL" | "ELECTRIC";
    minEngineCc?: number;
    maxEngineCc?: number;
    seatingCapacity?: number;
    fullyVerified?: boolean;
    sort?: "price" | "rating" | "distance";
    page?: number;
    limit?: number;
  },
): Promise<{ results: SearchResult[]; total: number }> {
  const sort = params.sort ?? "price";
  if (sort === "distance" && (params.lat == null || params.lng == null)) {
    throw new DistanceSortUnavailableError();
  }

  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);

  const boxClause =
    params.lat != null && params.lng != null
      ? `and s.latitude between $4 and $5 and s.longitude between $6 and $7`
      : "";
  const boxValues =
    params.lat != null && params.lng != null
      ? [params.lat - 0.2, params.lat + 0.2, params.lng - 0.2, params.lng + 0.2]
      : [];

  const { rows } = await pool.query(
    `${VEHICLE_ROW_SELECT}
      where lower(s.city) = lower($1)
        and s.deleted_at is null
        and v.status = 'ACTIVE'
        and v.deleted_at is null
        ${boxClause}
        and not exists (
          select 1 from bookings b
           where b.vehicle_id = v.id and b.deleted_at is null
             and tstzrange(b.scheduled_pickup_at, b.scheduled_return_at) && tstzrange($2, $3)
        )
        and not exists (
          select 1 from vehicle_unavailability u
           where u.vehicle_id = v.id
             and tstzrange(u.start_at, u.end_at) && tstzrange($2, $3)
        )`,
    [params.city, params.pickupAt, params.returnAt, ...boxValues],
  );

  if (rows.length === 0) return { results: [], total: 0 };

  const pricingIds: string[] = rows.map((r) => r.pricing_id);
  const { rows: specialRows } = await pool.query(
    `select vehicle_pricing_id, amount, weekend_amount, effective_from, effective_until
       from special_pricings
      where vehicle_pricing_id = any($1) and deleted_at is null`,
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

  for (const row of rows) {
    const specials = (specialsByPricing.get(row.pricing_id) ?? []).map((s) => ({
      amount: Number(s.amount),
      weekendAmount: Number(s.weekend_amount),
      effectiveFrom: s.effective_from.toISOString().slice(0, 10),
      effectiveUntil: s.effective_until.toISOString().slice(0, 10),
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

    if (params.minPrice != null && rentalAmount < params.minPrice) continue;
    if (params.maxPrice != null && rentalAmount > params.maxPrice) continue;
    if (params.modelId != null && row.model_id !== params.modelId) continue;
    if (params.minRating != null && (row.rating == null || Number(row.rating) < params.minRating)) continue;
    if (params.maxDistanceKm != null && (distanceKm == null || distanceKm > params.maxDistanceKm)) continue;
    if (params.fuelType != null && row.fuel_type !== params.fuelType) continue;
    if (params.minEngineCc != null && (row.engine_cc == null || row.engine_cc < params.minEngineCc)) continue;
    if (params.maxEngineCc != null && (row.engine_cc == null || row.engine_cc > params.maxEngineCc)) continue;
    if (params.seatingCapacity != null && row.seating_capacity !== params.seatingCapacity) continue;
    if (params.fullyVerified && licence == null) continue;

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

  const byModel = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const list = byModel.get(c.modelId) ?? [];
    list.push(c);
    byModel.set(c.modelId, list);
  }

  function rank(a: Candidate, b: Candidate): number {
    if (sort === "price") return a.totalAmount - b.totalAmount;
    if (sort === "rating") return (b.rating ?? -1) - (a.rating ?? -1);
    return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
  }

  let results: SearchResult[] = [];
  for (const [modelId, offers] of byModel) {
    offers.sort(rank);
    const primary = offers[0]!;
    results.push({
      model: {
        id: modelId,
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
    });
  }

  results.sort((a, b) => rank(a.primaryOffer as Candidate, b.primaryOffer as Candidate));

  const total = results.length;
  const start = (page - 1) * limit;
  results = results.slice(start, start + limit);

  return { results, total };
}

export interface VehicleDetail {
  vehicleId: string;
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
}

/** A single vehicle's full listing detail, independent of any search window. */
export async function getVehicleDetail(pool: Pool, vehicleId: string): Promise<VehicleDetail> {
  const { rows } = await pool.query(
    `${VEHICLE_ROW_SELECT}
      where v.id = $1 and v.deleted_at is null and s.deleted_at is null`,
    [vehicleId],
  );
  const row = rows[0];
  if (!row) throw new VehicleNotFoundError();

  return {
    vehicleId: row.vehicle_id,
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
  };
}
