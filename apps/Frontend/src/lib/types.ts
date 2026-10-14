/** Mirrors apps/Backend/src/Routes/user/Search/searchService.ts exactly. */
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
  /** paise — per-day rate for the first day of the window */
  pricePerDay: number;
  /** paise — the rental subtotal for the whole window */
  totalAmount: number;
  /** paise — refundable, held by the shop */
  securityDeposit: number;
  rating: number | null;
  reviewCount: number;
  distanceKm: number | null;
  licence: Licence | null;
}

export interface SearchModel {
  id: string;
  make: string;
  model: string;
  imageKey: string | null;
  fuelType: "PETROL" | "ELECTRIC" | null;
  engineCc: number | null;
  bodyType: string | null;
  seatingCapacity: number | null;
}

export interface SearchResult {
  model: SearchModel;
  primaryOffer: SearchOffer;
  /** number of offers that matched the active filters */
  offerCount: number;
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
  /** paise */
  amount: number;
  /** paise */
  weekendAmount: number;
  /** paise */
  securityDeposit: number;
  /** paise */
  lateFeeAmount: number;
  licence: Licence | null;
}

export type SortKey = "price" | "distance" | "rating";

export interface SearchCriteria {
  city: string;
  pickupAt: string;
  returnAt: string;
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
  sort: SortKey;
  page: number;
}
