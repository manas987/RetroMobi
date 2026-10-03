import { describe, expect, test } from "bun:test";
import { SHOP_PERMISSIONS, can } from "./permissions.ts";

// The whole point of this module: changing what a role can do is a one-file
// edit, not a grep across every route.

describe("shop roles", () => {
  test("OWNER can do everything any other role can", () => {
    const everything = new Set([
      ...SHOP_PERMISSIONS.MANAGER,
      ...SHOP_PERMISSIONS.STAFF,
    ]);
    for (const permission of everything) {
      expect(can("OWNER", permission)).toBe(true);
    }
  });

  test("MANAGER runs the fleet but never touches money or people", () => {
    expect(can("MANAGER", "fleet:write")).toBe(true);
    expect(can("MANAGER", "pricing:write")).toBe(true);
    expect(can("MANAGER", "bookings:read")).toBe(true);

    expect(can("MANAGER", "payouts:read")).toBe(false);
    expect(can("MANAGER", "payouts:write")).toBe(false);
    expect(can("MANAGER", "members:write")).toBe(false);
  });

  test("STAFF is operations only", () => {
    expect(can("STAFF", "bookings:read")).toBe(true);
    expect(can("STAFF", "bookings:return")).toBe(true);
    expect(can("STAFF", "tracking:read")).toBe(true);

    expect(can("STAFF", "fleet:write")).toBe(false);
    expect(can("STAFF", "pricing:write")).toBe(false);
    expect(can("STAFF", "payouts:read")).toBe(false);
    expect(can("STAFF", "members:write")).toBe(false);
  });

  test("only OWNER manages payouts and members", () => {
    for (const role of ["MANAGER", "STAFF"] as const) {
      expect(can(role, "payouts:write")).toBe(false);
      expect(can(role, "members:write")).toBe(false);
    }
    expect(can("OWNER", "payouts:write")).toBe(true);
    expect(can("OWNER", "members:write")).toBe(true);
  });

  test("an unknown permission is denied, never defaulted to allowed", () => {
    expect(can("OWNER", "nonsense:write" as never)).toBe(false);
    expect(can("STAFF", "nonsense:write" as never)).toBe(false);
  });
});
