export interface CartItem {
  modelId: string;
  shopId: string;
  make: string;
  model: string;
  shopName: string;
  /** paise, per day, per unit */
  pricePerDay: number;
  pickupAt?: string;
  returnAt?: string;
  /** one real vehicleId per unit requested — length is this line's qty */
  vehicleIds: string[];
  /** full pool this line's ids were drawn from — lets the cart drawer increase qty without re-fetching */
  availableVehicleIds: string[];
}

export interface CartLine {
  modelId: string;
  shopId: string;
  make: string;
  model: string;
  shopName: string;
  pricePerDay: number;
  pickupAt?: string;
  returnAt?: string;
}

// Matches the backend's CreateHoldSchema ("items" array, max 5) — now counted
// in total units across all lines, not distinct lines.
export const MAX_CART_ITEMS = 5;

/**
 * Drops vehicles the server says can no longer be booked, and any line left with
 * nothing in it. Both arrays are filtered: `availableVehicleIds` is the pool
 * `setQty` promotes extra units out of without re-fetching, so a stale id left
 * there comes back the moment someone bumps the quantity.
 *
 * Pure, and separate from the provider, so the interesting half is testable
 * without rendering anything.
 */
export function pruneCart(items: CartItem[], unavailable: string[]): CartItem[] {
  if (unavailable.length === 0) return items;
  const gone = new Set(unavailable);
  return items
    .map((item) => ({
      ...item,
      vehicleIds: item.vehicleIds.filter((id) => !gone.has(id)),
      availableVehicleIds: item.availableVehicleIds.filter((id) => !gone.has(id)),
    }))
    .filter((item) => item.vehicleIds.length > 0);
}

