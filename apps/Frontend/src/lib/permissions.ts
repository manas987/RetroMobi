/**
 * Mirrors apps/Backend/src/lib/permissions.ts exactly. Two copies of a rule
 * is worse than one, but the alternative is an extra round trip on every
 * page just to learn what the role already in `GET /shops` implies — and the
 * server is still the enforcer. This copy only decides what to *render*, so
 * drift makes a button appear that 403s, never the reverse.
 */
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
  | "shop:write"
  | "shop:delete";

const STAFF: readonly Permission[] = ["fleet:read", "bookings:read", "bookings:return", "tracking:read"];

const MANAGER: readonly Permission[] = [
  ...STAFF,
  "fleet:write",
  "pricing:read",
  "pricing:write",
  "bookings:write",
  "members:read",
  "shop:write",
];

const OWNER: readonly Permission[] = [
  ...MANAGER,
  "payouts:read",
  "payouts:write",
  "members:write",
  "shop:delete",
];

const BY_ROLE: Record<ShopRole, readonly Permission[]> = {
  OWNER,
  MANAGER,
  STAFF,
};

/** An unknown role grants nothing — a stale token must not open the portal up. */
export function can(role: string | null | undefined, permission: Permission): boolean {
  const list = BY_ROLE[role as ShopRole];
  return list ? list.includes(permission) : false;
}

export const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  STAFF: "Staff",
};
