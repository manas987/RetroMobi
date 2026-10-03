import type { Pool } from "pg";
import { priceRental } from "../../../lib/pricing.ts";

export class DistanceSortUnavailableError extends Error {}

export interface SearchOffer {
  vehicleId: string;
  shopId: string;
  shopName: string;
  pricePerDay: number;
  totalAmount: number;
  rating: number | null;
  distanceKm: number | null;
  badges: { shop: string; vehicle: string };
}

export interface SearchResult {
  model: { id: string; make: string; model: string; imageKey: string | null };
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
    `select v.id as vehicle_id, v.shop_id, v.model_id,
            s.name as shop_name, s.rating, s.latitude, s.longitude,
            vp.id as pricing_id, vp.amount, vp.weekend_amount, vp.security_deposit_amount,
            m.make, m.model, m.image_key
       from vehicles v
       join vehicle_pricing vp on vp.vehicle_id = v.id
       join shops s on s.id = v.shop_id
       join vehicle_models m on m.id = v.model_id
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

  type Candidate = SearchOffer & { modelId: string; make: string; modelName: string; imageKey: string | null };
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

    if (params.minPrice != null && rentalAmount < params.minPrice) continue;
    if (params.maxPrice != null && rentalAmount > params.maxPrice) continue;
    if (params.modelId != null && row.model_id !== params.modelId) continue;
    if (params.minRating != null && (row.rating == null || Number(row.rating) < params.minRating)) continue;
    if (params.maxDistanceKm != null && (distanceKm == null || distanceKm > params.maxDistanceKm)) continue;

    candidates.push({
      vehicleId: row.vehicle_id,
      shopId: row.shop_id,
      shopName: row.shop_name,
      pricePerDay: days[0]!.amount,
      totalAmount: rentalAmount,
      rating: row.rating != null ? Number(row.rating) : null,
      distanceKm,
      badges: { shop: "", vehicle: "" },
      modelId: row.model_id,
      make: row.make,
      modelName: row.model,
      imageKey: row.image_key,
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
      model: { id: modelId, make: primary.make, model: primary.modelName, imageKey: primary.imageKey },
      primaryOffer: {
        vehicleId: primary.vehicleId,
        shopId: primary.shopId,
        shopName: primary.shopName,
        pricePerDay: primary.pricePerDay,
        totalAmount: primary.totalAmount,
        rating: primary.rating,
        distanceKm: primary.distanceKm,
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
