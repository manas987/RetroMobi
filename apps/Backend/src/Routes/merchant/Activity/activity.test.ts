import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import {
  createBookableVehicle,
  createMerchant,
  createShop,
  futureWindow,
  insertBooking,
  uniquePhone,
} from "../../../test/fixtures.ts";
import { merchantReturn } from "../../user/Pickup/pickupService.ts";
import { updateVehicle } from "../Fleet/fleetService.ts";
import {
  AlreadyMemberError,
  InviteAlreadyPendingError,
  InviteNotFoundError,
  cancelInvite,
  inviteMember,
  listInvites,
} from "../Members/membersService.ts";
import { listActivity } from "./activityService.ts";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

async function shopWithVehicle() {
  const merchant = await createMerchant(pool);
  const shop = await createShop(pool, merchant.id);
  const vehicle = await createBookableVehicle(pool, { shopId: shop.id });
  return { merchant, shop, vehicle };
}

describe("shop activity log", () => {
  test("a listing toggle is stored with the shop and shows up, other shops never see it", async () => {
    const a = await shopWithVehicle();
    const b = await shopWithVehicle();
    await updateVehicle(pool, a.merchant.id, a.vehicle.id, { status: "INACTIVE" });

    const { items } = await listActivity(pool, a.shop.id, {});
    const row = items.find((i) => i.action === "vehicle.listing_changed")!;
    expect(row.after).toEqual({ status: "INACTIVE" });
    expect(row.actor_id).toBe(a.merchant.id);
    expect(row.actor_role).toBe("OWNER");
    expect(row.registration_number).toBeTruthy();

    const other = await listActivity(pool, b.shop.id, {});
    expect(other.items.some((i) => i.action === "vehicle.listing_changed")).toBe(false);
  });

  test("kind filters and before paginates", async () => {
    const { merchant, shop, vehicle } = await shopWithVehicle();
    await inviteMember(pool, merchant.id, shop.id, { phone: uniquePhone(), role: "STAFF" });
    for (let i = 0; i < 52; i++) {
      await updateVehicle(pool, merchant.id, vehicle.id, { status: i % 2 ? "ACTIVE" : "INACTIVE" });
    }

    const staff = await listActivity(pool, shop.id, { kind: "staff" });
    expect(staff.items.map((i) => i.action)).toEqual(["shop.member_invited"]);
    expect((await listActivity(pool, shop.id, { kind: "bookings" })).items).toHaveLength(0);

    const page1 = await listActivity(pool, shop.id, {});
    expect(page1.items).toHaveLength(50);
    expect(page1.nextBefore).not.toBeNull();
    const page2 = await listActivity(pool, shop.id, { before: new Date(page1.nextBefore) });
    expect(page2.items.length).toBeGreaterThan(0);
    expect(page2.items.some((i) => page1.items.some((p) => p.id === i.id))).toBe(false);
    expect(page2.nextBefore).toBeNull();
  });

  test("duplicate invites and inviting a member are refused; cancelling is audited", async () => {
    const { merchant, shop } = await shopWithVehicle();
    const phone = uniquePhone();
    const invite = await inviteMember(pool, merchant.id, shop.id, { phone, role: "STAFF" });
    await expect(inviteMember(pool, merchant.id, shop.id, { phone, role: "MANAGER" })).rejects.toBeInstanceOf(
      InviteAlreadyPendingError,
    );

    const { rows } = await pool.query(`select phone from merchant_users where id = $1`, [merchant.id]);
    await expect(
      inviteMember(pool, merchant.id, shop.id, { phone: rows[0].phone, role: "STAFF" }),
    ).rejects.toBeInstanceOf(AlreadyMemberError);

    await cancelInvite(pool, merchant.id, shop.id, invite.id);
    expect(await listInvites(pool, shop.id)).toHaveLength(0);
    await expect(cancelInvite(pool, merchant.id, shop.id, invite.id)).rejects.toBeInstanceOf(InviteNotFoundError);

    const { items } = await listActivity(pool, shop.id, { kind: "staff" });
    expect(items[0]!.action).toBe("shop.invite_cancelled");
    expect(items[0]!.after).toEqual({ phone, role: "STAFF" });
  });

  test("a return with a deposit claim records the claim amount", async () => {
    const { merchant, shop, vehicle } = await shopWithVehicle();
    const { pickupAt, returnAt } = futureWindow(900, 1);
    const booking = await insertBooking(pool, { vehicleId: vehicle.id, pickupAt: pickupAt.toISOString(), returnAt: returnAt.toISOString() });
    await pool.query(`update bookings set actual_pickup_at = now() where id = $1`, [booking.id]);

    await merchantReturn(
      pool,
      { merchantUserId: merchant.id, bookingId: booking.id, claim: true, reason: "dent", amount: 500 },
      { refund: async () => ({ refundId: "x", status: "PENDING" as const }) } as never,
      async () => ({ id: "t1", assignedTo: null }),
    );

    const { items } = await listActivity(pool, shop.id, { kind: "bookings" });
    expect(items[0]!.action).toBe("booking.returned");
    expect(items[0]!.after).toEqual({ claim: true, amount: 500, reason: "dent" });
    expect(items[0]!.booking_id).toBe(booking.id);
  });
});
