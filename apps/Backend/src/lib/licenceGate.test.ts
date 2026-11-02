// The gate end to end: real rows, real joins, the real seeded rules. The pure
// rules are covered in licenceEligibility.test.ts -- what is tested here is
// that the right data reaches them, which is where this kind of thing breaks
// (bookings has no model_id; dates come back as text, not Date; the categories
// hang off the verification, not the rider).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../DB/migrate.ts";
import {
  createBookableVehicle,
  createModel,
  createRider,
  createUser,
  futureWindow,
} from "../test/fixtures.ts";
import {
  LicenceInvalidError,
  LicenceReviewRequiredError,
  createHold,
} from "../Routes/user/Bookings/bookingsService.ts";
import { evaluateRiderForVehicle } from "./licenceGate.ts";

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

async function evaluate(riderId: string, userId: string, vehicleId: string) {
  const client = await pool.connect();
  try {
    const { pickupAt, returnAt } = futureWindow(900);
    return await evaluateRiderForVehicle(client, {
      userId,
      riderId,
      vehicleId,
      rentalStart: new Date(pickupAt.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10),
      rentalEnd: new Date(returnAt.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10),
    });
  } finally {
    client.release();
  }
}

describe("evaluateRiderForVehicle", () => {
  test("a geared-motorcycle licence passes for a scooter", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { categories: ["MCWG"] });
    const vehicle = await createBookableVehicle(pool);

    expect(await evaluate(rider.id, user.id, vehicle.id)).toMatchObject({
      outcome: "PASS",
      flagForReview: false,
    });
  });

  // The reason driving_licence_categories exists at all.
  test("a gearless-only licence fails for a geared motorcycle", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { categories: ["MCWOG"] });
    const model = await createModel(pool, { class: "MOTORCYCLE" });
    const vehicle = await createBookableVehicle(pool, { modelId: model.id });

    const result = await evaluate(rider.id, user.id, vehicle.id);
    expect(result.outcome).toBe("FAIL");
    expect(result.reasons).toEqual(["CATEGORY_NOT_ALLOWED"]);
  });

  test("a vehicle class nobody has mapped fails closed rather than passing", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id);
    const model = await createModel(pool, { class: "HOVERCRAFT" });
    const vehicle = await createBookableVehicle(pool, { modelId: model.id });

    expect((await evaluate(rider.id, user.id, vehicle.id)).reasons).toEqual(["NO_RULE"]);
  });

  test("a model with no class at all also fails closed", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id);
    const model = await createModel(pool, { class: null });
    const vehicle = await createBookableVehicle(pool, { modelId: model.id });

    expect((await evaluate(rider.id, user.id, vehicle.id)).reasons).toEqual(["NO_RULE"]);
  });

  test("an unverified rider has no licence to judge", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { verified: false });
    const vehicle = await createBookableVehicle(pool);

    expect((await evaluate(rider.id, user.id, vehicle.id)).reasons).toEqual(["NO_LICENCE"]);
  });

  // Not 403: another account's rider must not be distinguishable from one that
  // does not exist.
  test("someone else's rider is simply not found", async () => {
    const owner = await createUser(pool);
    const stranger = await createUser(pool);
    const rider = await createRider(pool, owner.id);
    const vehicle = await createBookableVehicle(pool);

    expect((await evaluate(rider.id, stranger.id, vehicle.id)).reasons).toEqual(["NO_LICENCE"]);
  });

  test("an RTO that returned no status goes to review, not to a refusal", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { licenceStatus: null });
    const vehicle = await createBookableVehicle(pool);

    expect((await evaluate(rider.id, user.id, vehicle.id))).toMatchObject({
      outcome: "REVIEW",
      reasons: ["STATUS_UNKNOWN"],
    });
  });

  // Dates are selected with to_char for this reason: as a pg `date` they come
  // back as a JS Date at local midnight, a day early in IST.
  test("a licence expiring the day after return is fine, and is not shifted a day", async () => {
    const user = await createUser(pool);
    const { returnAt } = futureWindow(900);
    const lastDay = new Date(returnAt.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const rider = await createRider(pool, user.id, { dlExpiresOn: lastDay });
    const vehicle = await createBookableVehicle(pool);

    expect((await evaluate(rider.id, user.id, vehicle.id)).outcome).toBe("PASS");
  });
});

describe("createHold's gate", () => {
  test("an ineligible rider cannot book, and the reason says why", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { categories: ["LMV"] });
    const vehicle = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(900);

    await expect(
      createHold(pool, {
        userId: user.id,
        items: [{ vehicleId: vehicle.id, riderId: rider.id }],
        pickupAt,
        returnAt,
      }),
    ).rejects.toThrow(/CATEGORY_NOT_ALLOWED/);
  });

  test("a learner's licence is refused", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { categories: ["MCWG-LRN"] });
    const vehicle = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(900);

    await expect(
      createHold(pool, {
        userId: user.id,
        items: [{ vehicleId: vehicle.id, riderId: rider.id }],
        pickupAt,
        returnAt,
      }),
    ).rejects.toBeInstanceOf(LicenceInvalidError);
  });

  test("an unjudgeable licence is a review, a distinct error from an invalid one", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { licenceStatus: null });
    const vehicle = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(900);

    const attempt = createHold(pool, {
      userId: user.id,
      items: [{ vehicleId: vehicle.id, riderId: rider.id }],
      pickupAt,
      returnAt,
    });
    await expect(attempt).rejects.toBeInstanceOf(LicenceReviewRequiredError);
    await expect(attempt).rejects.not.toBeInstanceOf(LicenceInvalidError);
  });

  // The grace window exists so migration 0015's backfilled riders can still
  // book. If this blocked, the whole grace mechanism would be pointless.
  test("a grandfathered legacy licence books, and flags its session for review", async () => {
    process.env.LEGACY_LICENCE_GRACE_UNTIL = "2099-12-31";
    try {
      const user = await createUser(pool);
      const rider = await createRider(pool, user.id, {
        policyVersion: "legacy",
        categories: [],
        licenceStatus: null,
      });
      const vehicle = await createBookableVehicle(pool);
      const { pickupAt, returnAt } = futureWindow(900);

      await createHold(pool, {
        userId: user.id,
        items: [{ vehicleId: vehicle.id, riderId: rider.id }],
        pickupAt,
        returnAt,
      });

      const { rows } = await pool.query(
        `select s.review_required,
                (select count(*)::int from rider_verification_events e
                  where e.session_id = s.id and e.event_type = 'eligibility_flagged') as flags
           from rider_verification_sessions s where s.rider_id = $1`,
        [rider.id],
      );
      expect(rows[0].review_required).toBe(true);
      expect(rows[0].flags).toBe(1);
    } finally {
      delete process.env.LEGACY_LICENCE_GRACE_UNTIL;
    }
  });

  test("after the grace window the same rider cannot book", async () => {
    process.env.LEGACY_LICENCE_GRACE_UNTIL = "2020-01-01";
    try {
      const user = await createUser(pool);
      const rider = await createRider(pool, user.id, {
        policyVersion: "legacy",
        categories: [],
        licenceStatus: null,
      });
      const vehicle = await createBookableVehicle(pool);
      const { pickupAt, returnAt } = futureWindow(900);

      await expect(
        createHold(pool, {
          userId: user.id,
          items: [{ vehicleId: vehicle.id, riderId: rider.id }],
          pickupAt,
          returnAt,
        }),
      ).rejects.toThrow(/NO_CATEGORY_DATA/);
    } finally {
      delete process.env.LEGACY_LICENCE_GRACE_UNTIL;
    }
  });
});
