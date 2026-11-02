// The handover gate. Automated face matching was dropped, so these rows are
// the ONLY evidence binding a human to a licence -- which makes "the vehicle
// cannot change hands without one" the most load-bearing assertion in the
// suite.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import {
  createBookableVehicle,
  createRider,
  createUser,
  futureWindow,
} from "../../../test/fixtures.ts";
import { createHold } from "../../user/Bookings/bookingsService.ts";
import { confirmInspection } from "../../user/Pickup/pickupService.ts";
import {
  AlreadyCheckedError,
  BookingNotFoundError,
  IdentityCheckFailedError,
  IdentityCheckMissingError,
  VerificationRequiredError,
  getIdentityForPickup,
  recordIdentityCheck,
} from "./identityService.ts";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

/** A CONFIRMED booking with a verified rider, its merchant, and the licence's last four. */
async function booking(riderOpts: Parameters<typeof createRider>[2] = {}) {
  const user = await createUser(pool);
  const rider = await createRider(pool, user.id, riderOpts);
  const vehicle = await createBookableVehicle(pool);
  const { pickupAt, returnAt } = futureWindow(900);
  const held = await createHold(pool, {
    userId: user.id,
    items: [{ vehicleId: vehicle.id, riderId: rider.id }],
    pickupAt,
    returnAt,
  });
  // confirmInspection only accepts a CONFIRMED booking. Set directly rather
  // than driving a payment through: this file is about the identity gate.
  await pool.query(`update bookings set status = 'CONFIRMED' where id = $1`, [
    held.bookings[0]!.id,
  ]);

  const { rows } = await pool.query(
    `select sh.merchant_user_id, dlv.licence_number
       from vehicles v join shops sh on sh.id = v.shop_id
       left join driving_licence_verifications dlv on dlv.rider_id = $2 and dlv.status = 'VERIFIED'
      where v.id = $1`,
    [vehicle.id, rider.id],
  );
  return {
    userId: user.id as string,
    riderId: rider.id as string,
    bookingId: held.bookings[0]!.id as string,
    merchantUserId: rows[0].merchant_user_id as string,
    last4: String(rows[0].licence_number).slice(-4),
  };
}

describe("what staff are shown", () => {
  test("the minimum needed to compare a face, and no more", async () => {
    const b = await booking();
    const view = await getIdentityForPickup(pool, b.merchantUserId, b.bookingId);

    expect(view).toMatchObject({
      bookingId: b.bookingId,
      verificationState: "VERIFIED",
      alreadyChecked: false,
    });
    // The mask, never the number.
    expect(view.licenceNumberMasked).toMatch(/\*{3,}/);
    // Data minimisation: a shop assistant has no reason to see any of this.
    expect(view).not.toHaveProperty("address");
    expect(view).not.toHaveProperty("licenceNumber");
    expect(view).not.toHaveProperty("fatherName");
  });

  test("another merchant's booking is not found", async () => {
    const b = await booking();
    const stranger = await createUser(pool);
    await expect(getIdentityForPickup(pool, stranger.id, b.bookingId)).rejects.toBeInstanceOf(
      BookingNotFoundError,
    );
  });
});

describe("recording the check", () => {
  test("both confirmations plus a matching last-4 records it once", async () => {
    const b = await booking();
    const result = await recordIdentityCheck(pool, b.merchantUserId, b.bookingId, {
      photoMatched: true,
      physicalDlSeen: true,
      dlNumberLast4: b.last4,
    });
    expect(result.id).toBeTruthy();

    const { rows } = await pool.query(
      `select checked_by, photo_matched, physical_dl_seen from pickup_identity_checks where booking_id = $1`,
      [b.bookingId],
    );
    // A row with an author and a timestamp, not a UI checkbox.
    expect(rows[0]).toEqual({
      checked_by: b.merchantUserId,
      photo_matched: true,
      physical_dl_seen: true,
    });
  });

  test("a second check is refused rather than overwriting the first", async () => {
    const b = await booking();
    const ok = { photoMatched: true, physicalDlSeen: true, dlNumberLast4: b.last4 };
    await recordIdentityCheck(pool, b.merchantUserId, b.bookingId, ok);
    await expect(recordIdentityCheck(pool, b.merchantUserId, b.bookingId, ok)).rejects.toBeInstanceOf(
      AlreadyCheckedError,
    );
  });

  test("a photo that did not match is a refusal, and is audited", async () => {
    const b = await booking();
    await expect(
      recordIdentityCheck(pool, b.merchantUserId, b.bookingId, {
        photoMatched: false,
        physicalDlSeen: true,
        dlNumberLast4: b.last4,
      }),
    ).rejects.toBeInstanceOf(IdentityCheckFailedError);

    // The refusal is the event somebody will want to find later, so it
    // survives the throw.
    const { rows } = await pool.query(
      `select 1 from audit_logs where entity_id = $1 and action = 'booking.identity_check_failed'`,
      [b.bookingId],
    );
    expect(rows).toHaveLength(1);
    const checks = await pool.query(
      `select count(*)::int as n from pickup_identity_checks where booking_id = $1`,
      [b.bookingId],
    );
    expect(checks.rows[0].n).toBe(0);
  });

  test("no original licence produced is equally a refusal", async () => {
    const b = await booking();
    await expect(
      recordIdentityCheck(pool, b.merchantUserId, b.bookingId, {
        photoMatched: true,
        physicalDlSeen: false,
        dlNumberLast4: b.last4,
      }),
    ).rejects.toBeInstanceOf(IdentityCheckFailedError);
  });

  // The single most useful fraud signal this design has: the card in the shop
  // is not the licence that was verified.
  test("a last-4 that does not match the verified licence is refused and audited", async () => {
    const b = await booking();
    await expect(
      recordIdentityCheck(pool, b.merchantUserId, b.bookingId, {
        photoMatched: true,
        physicalDlSeen: true,
        dlNumberLast4: "0000",
      }),
    ).rejects.toBeInstanceOf(IdentityCheckFailedError);

    const { rows } = await pool.query(
      `select 1 from audit_logs where entity_id = $1 and action = 'booking.identity_check_licence_mismatch'`,
      [b.bookingId],
    );
    expect(rows).toHaveLength(1);
  });
});

describe("the handover gate", () => {
  test("a vehicle cannot change hands before staff have checked the rider", async () => {
    const b = await booking();
    await expect(
      confirmInspection(pool, {
        userId: b.userId,
        bookingId: b.bookingId,
        storageKey: "inspections/x.mp4",
      }),
    ).rejects.toBeInstanceOf(IdentityCheckMissingError);
  });

  test("with the check in place it proceeds", async () => {
    const b = await booking();
    await recordIdentityCheck(pool, b.merchantUserId, b.bookingId, {
      photoMatched: true,
      physicalDlSeen: true,
      dlNumberLast4: b.last4,
    });

    await confirmInspection(pool, {
      userId: b.userId,
      bookingId: b.bookingId,
      storageKey: "inspections/x.mp4",
    });

    const { rows } = await pool.query(`select actual_pickup_at from bookings where id = $1`, [
      b.bookingId,
    ]);
    expect(rows[0].actual_pickup_at).toBeInstanceOf(Date);
  });

  // The whole reason the check runs again at handover rather than only at
  // booking: a licence valid in November can be expired by the pickup date.
  test("a licence that expired since the booking blocks the handover", async () => {
    const b = await booking();
    await recordIdentityCheck(pool, b.merchantUserId, b.bookingId, {
      photoMatched: true,
      physicalDlSeen: true,
      dlNumberLast4: b.last4,
    });
    await pool.query(
      `update driving_licence_verifications set expires_on = '2020-01-01' where rider_id = $1`,
      [b.riderId],
    );

    await expect(
      confirmInspection(pool, {
        userId: b.userId,
        bookingId: b.bookingId,
        storageKey: "inspections/x.mp4",
      }),
    ).rejects.toBeInstanceOf(VerificationRequiredError);
  });

  test("a verification that stopped being VERIFIED blocks the handover", async () => {
    const b = await booking();
    await recordIdentityCheck(pool, b.merchantUserId, b.bookingId, {
      photoMatched: true,
      physicalDlSeen: true,
      dlNumberLast4: b.last4,
    });
    await pool.query(
      `update rider_verification_sessions set state = 'REVOKED'
        where rider_id = $1`,
      [b.riderId],
    );

    await expect(
      confirmInspection(pool, {
        userId: b.userId,
        bookingId: b.bookingId,
        storageKey: "inspections/x.mp4",
      }),
    ).rejects.toBeInstanceOf(VerificationRequiredError);
  });

  test("an identity check cannot be recorded for an already-ineligible rider", async () => {
    const b = await booking();
    await pool.query(
      `update driving_licence_verifications set expires_on = '2020-01-01' where rider_id = $1`,
      [b.riderId],
    );

    await expect(
      recordIdentityCheck(pool, b.merchantUserId, b.bookingId, {
        photoMatched: true,
        physicalDlSeen: true,
        dlNumberLast4: b.last4,
      }),
    ).rejects.toBeInstanceOf(VerificationRequiredError);
  });
});
