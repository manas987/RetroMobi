/** Mirrors the backend's SearchOffer, including the fields A1 adds. */
export interface Licence {
  licenceNumber: string;
  issuingAuthority: string | null;
  validUntil: string | null;
  documentsVerifiedAt: string | null;
}

export interface SearchOffer {
  vehicleId: string;
  shopId: string;
  shopName: string;
  shopPhone: string | null;
  shopLatitude: number | null;
  shopLongitude: number | null;
  /** paise — the rental subtotal for the window, excluding fee and deposit */
  rentalTotal: number;
  /** paise — lowest single-day rate inside the window */
  minDayRate: number;
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
  fuelType: "PETROL" | "ELECTRIC" | null;
  engineCc: number | null;
  bodyType: string | null;
  seatingCapacity: number | null;
  imageUrl: string | null;
}

export interface SearchResult {
  model: SearchModel;
  primaryOffer: SearchOffer;
  /** number of offers that matched the active filters */
  offerCount: number;
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
