export type ShopRole = "OWNER" | "MANAGER" | "STAFF";

export type Permission =
  | "fleet:read"
  | "fleet:write"
  | "pricing:read"
  | "pricing:write"
  | "bookings:read"
  | "bookings:write"
  | "bookings:return"
  | "tracking:read"
  | "payouts:read"
  | "payouts:write"
  | "members:read"
  | "members:write"
  | "shop:write";

const MANAGER: readonly Permission[] = [
  "fleet:read",
  "fleet:write",
  "pricing:read",
  "pricing:write",
  "bookings:read",
  "bookings:write",
  "bookings:return",
  "tracking:read",
  "shop:write",
  "members:read",
];

const STAFF: readonly Permission[] = [
  "bookings:read",
  "bookings:return",
  "tracking:read",
  "fleet:read",
];

const ALL: readonly Permission[] = [
  "fleet:read",
  "fleet:write",
  "pricing:read",
  "pricing:write",
  "bookings:read",
  "bookings:write",
  "bookings:return",
  "tracking:read",
  "payouts:read",
  "payouts:write",
  "members:read",
  "members:write",
  "shop:write",
];

export const SHOP_PERMISSIONS: Record<ShopRole, readonly Permission[]> = {
  OWNER: ALL,
  MANAGER,
  STAFF,
};

export function can(role: ShopRole, permission: Permission): boolean {
  return SHOP_PERMISSIONS[role]?.includes(permission) ?? false;
}
