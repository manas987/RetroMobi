import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createBookableVehicle, createMerchant, createModel, createShop, uniqueRegistration } from "../../../test/fixtures.ts";
import { submitVehicleForVerification } from "../Fleet/fleetService.ts";
import { getShopSetup } from "./setupService.ts";

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

async function bareVehicle(shopId: string) {
  const model = await createModel(pool);
  const { rows } = await pool.query(
    `insert into vehicles (shop_id, model_id, registration_number) values ($1, $2, $3) returning id`,
    [shopId, model.id, uniqueRegistration()],
  );
  return rows[0].id as string;
}

async function addDoc(vehicleId: string, type: string, opts: { status?: string; expiresAt?: string; file?: boolean } = {}) {
  const { rows } = await pool.query(
    `insert into vehicle_documents (vehicle_id, type, status, expires_at, storage_key)
     values ($1, $2, $3, $4, $5) returning id`,
    [vehicleId, type, opts.status ?? "PENDING", opts.expiresAt ?? null, opts.file === false ? null : `k/${type}`],
  );
  return rows[0].id as string;
}

describe("shop setup checklist", () => {
  test("a bare vehicle lists everything it is missing and cannot be submitted", async () => {
    const merchant = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id);
    const id = await bareVehicle(shop.id);

    const s = await getShopSetup(pool, shop.id);
    const v = s.vehicles.find((x) => x.id === id)!;
    expect(v.missing).toEqual(["price", "photo", "doc:RC", "doc:INSURANCE", "doc:PUC"]);
    expect(v.stage).toBe("NEEDS_INFO");
    expect(v.canSubmit).toBe(false);
    expect(s.steps.vehicles).toBe(false);
    expect(s.licence.status).toBe("NONE");
    expect(s.payoutAccount.status).toBe("NONE");
  });

  test("a document row with no file still counts as missing; a complete vehicle can be submitted", async () => {
    const merchant = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id);
    const id = await bareVehicle(shop.id);
    await pool.query(`insert into vehicle_pricing (vehicle_id, amount, weekend_amount) values ($1, 50000, 60000)`, [id]);
    await pool.query(`insert into vehicle_media (vehicle_id, storage_key) values ($1, 'k/photo')`, [id]);
    await addDoc(id, "RC");
    await addDoc(id, "INSURANCE");
    await addDoc(id, "PUC", { file: false });

    let v = (await getShopSetup(pool, shop.id)).vehicles.find((x) => x.id === id)!;
    expect(v.missing).toEqual(["doc:PUC"]);
    expect(v.docs.PUC!.state).toBe("MISSING");

    await addDoc(id, "PUC");
    v = (await getShopSetup(pool, shop.id)).vehicles.find((x) => x.id === id)!;
    expect(v.missing).toEqual([]);
    expect(v.canSubmit).toBe(true);

    await submitVehicleForVerification(pool, merchant.id, id);
    v = (await getShopSetup(pool, shop.id)).vehicles.find((x) => x.id === id)!;
    expect(v.stage).toBe("CHECKING");
    expect(v.canSubmit).toBe(false);
    // Submitting twice is refused rather than silently re-queued.
    await expect(submitVehicleForVerification(pool, merchant.id, id)).rejects.toThrow();
  });

  test("a rejected or expired document puts the vehicle in NEEDS_FIXING with the admin's note", async () => {
    const merchant = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id);
    const id = await bareVehicle(shop.id);
    const docId = await addDoc(id, "INSURANCE", { status: "REJECTED" });
    await addDoc(id, "PUC", { status: "VERIFIED", expiresAt: "2020-01-01" });
    await pool.query(
      `insert into audit_logs (actor_type, action, entity_type, entity_id, after)
       values ('ADMIN', 'vehicle_document.verification_decided', 'vehicle_document', $1, $2)`,
      [docId, JSON.stringify({ status: "REJECTED", note: "Photo is blurry" })],
    );

    const v = (await getShopSetup(pool, shop.id)).vehicles.find((x) => x.id === id)!;
    expect(v.stage).toBe("NEEDS_FIXING");
    expect(v.docs.INSURANCE).toMatchObject({ state: "REJECTED", note: "Photo is blurry" });
    expect(v.docs.PUC!.state).toBe("EXPIRED");
  });

  test("a verified, licensed vehicle at a verified shop is READY, and SHOWING once listed", async () => {
    const v = await createBookableVehicle(pool, { status: "INACTIVE" });
    let s = await getShopSetup(pool, v.shopId);
    expect(s.vehicles[0]!.stage).toBe("READY");
    expect(s.vehicles[0]!.licenceLinked).toBe(true);

    await pool.query(`update vehicles set status = 'ACTIVE' where id = $1`, [v.id]);
    s = await getShopSetup(pool, v.shopId);
    expect(s.vehicles[0]!.stage).toBe("SHOWING");
    expect(s.licence.status).toBe("ACTIVE");
  });
});
