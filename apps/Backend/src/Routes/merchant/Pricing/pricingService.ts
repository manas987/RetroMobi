import type { Pool } from "pg";
import { writeAudit } from "../../../lib/audit.ts";

export class PricingNotFoundError extends Error {}
export class SpecialPricingNotFoundError extends Error {}

export async function getPricing(pool: Pool, vehicleId: string) {
  const { rows } = await pool.query(
    `select * from vehicle_pricing where vehicle_id = $1`,
    [vehicleId],
  );
  if (rows.length === 0) throw new PricingNotFoundError(`no pricing for vehicle ${vehicleId}`);
  const pricing = rows[0];

  const { rows: specials } = await pool.query(
    `select * from special_pricings where vehicle_pricing_id = $1 and deleted_at is null order by effective_from`,
    [pricing.id],
  );

  return { ...pricing, specials };
}

export async function upsertPricing(
  pool: Pool,
  merchantUserId: string,
  vehicleId: string,
  input: { amount: number; weekendAmount: number; securityDepositAmount: number; lateFeeAmount: number },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: beforeRows } = await client.query(
      `select * from vehicle_pricing where vehicle_id = $1`,
      [vehicleId],
    );

    const { rows } = await client.query(
      `insert into vehicle_pricing (vehicle_id, amount, weekend_amount, security_deposit_amount, late_fee_amount)
       values ($1, $2, $3, $4, $5)
       on conflict (vehicle_id) do update set
         amount = excluded.amount,
         weekend_amount = excluded.weekend_amount,
         security_deposit_amount = excluded.security_deposit_amount,
         late_fee_amount = excluded.late_fee_amount,
         updated_at = now()
       returning *`,
      [vehicleId, input.amount, input.weekendAmount, input.securityDepositAmount, input.lateFeeAmount],
    );

    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "pricing.updated",
      entityType: "vehicle_pricing",
      entityId: rows[0].id,
      before: beforeRows[0] ?? null,
      after: rows[0],
    });

    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listSpecials(pool: Pool, vehicleId: string) {
  const { rows: pricingRows } = await pool.query(
    `select id from vehicle_pricing where vehicle_id = $1`,
    [vehicleId],
  );
  if (pricingRows.length === 0) throw new PricingNotFoundError(`no pricing for vehicle ${vehicleId}`);

  const { rows } = await pool.query(
    `select * from special_pricings where vehicle_pricing_id = $1 and deleted_at is null order by effective_from`,
    [pricingRows[0].id],
  );
  return rows;
}

export async function addSpecial(
  pool: Pool,
  merchantUserId: string,
  vehicleId: string,
  input: { name: string; amount: number; weekendAmount: number; effectiveFrom: string; effectiveUntil: string },
) {
  const { rows: pricingRows } = await pool.query(
    `select id from vehicle_pricing where vehicle_id = $1`,
    [vehicleId],
  );
  if (pricingRows.length === 0) throw new PricingNotFoundError(`no pricing for vehicle ${vehicleId}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `insert into special_pricings (vehicle_pricing_id, name, amount, weekend_amount, effective_from, effective_until)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [pricingRows[0].id, input.name, input.amount, input.weekendAmount, input.effectiveFrom, input.effectiveUntil],
    );
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "pricing.special_added",
      entityType: "special_pricing",
      entityId: rows[0].id,
      after: rows[0],
    });
    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function softDeleteSpecial(pool: Pool, merchantUserId: string, specialId: string) {
  const { rowCount } = await pool.query(
    `update special_pricings set deleted_at = now() where id = $1 and deleted_at is null`,
    [specialId],
  );
  if (!rowCount) throw new SpecialPricingNotFoundError(`special pricing ${specialId} not found`);
}
