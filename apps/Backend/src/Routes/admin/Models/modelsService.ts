import type { Pool } from "pg";
import { writeAudit } from "../../../lib/audit.ts";

export class ModelNotFoundError extends Error {}
export class ModelTakenError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export interface ModelInput {
  make: string;
  model: string;
  class?: string;
  fuelType?: "PETROL" | "ELECTRIC";
  engineCc?: number;
  bodyType?: string;
  seatingCapacity?: number;
}

export async function listModels(pool: Pool, filters: { isActive?: boolean; q?: string }) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.isActive !== undefined) {
    values.push(filters.isActive);
    conditions.push(`is_active = $${values.length}`);
  }
  if (filters.q) {
    values.push(`%${filters.q}%`);
    conditions.push(`(make ilike $${values.length} or model ilike $${values.length})`);
  }
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const { rows } = await pool.query(`select * from vehicle_models ${where} order by make, model`, values);
  return rows;
}

export async function createModel(pool: Pool, adminId: string, input: ModelInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let rows;
    try {
      ({ rows } = await client.query(
        `insert into vehicle_models (make, model, class, fuel_type, engine_cc, body_type, seating_capacity)
         values ($1, $2, $3, $4, $5, $6, $7) returning *`,
        [
          input.make,
          input.model,
          input.class ?? null,
          input.fuelType ?? null,
          input.engineCc ?? null,
          input.bodyType ?? null,
          input.seatingCapacity ?? null,
        ],
      ));
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ModelTakenError(`model ${input.make} ${input.model} already exists`);
      }
      throw err;
    }
    await writeAudit(client, {
      actorType: "ADMIN",
      actorId: adminId,
      action: "model.created",
      entityType: "vehicle_model",
      entityId: rows[0].id,
      after: { make: input.make, model: input.model },
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

const COLUMN_BY_KEY: Record<string, string> = {
  make: "make",
  model: "model",
  class: "class",
  fuelType: "fuel_type",
  engineCc: "engine_cc",
  bodyType: "body_type",
  seatingCapacity: "seating_capacity",
};

export async function updateModel(pool: Pool, adminId: string, modelId: string, input: Partial<ModelInput>) {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    const column = COLUMN_BY_KEY[key];
    if (!column || value === undefined) continue;
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length === 0) {
    const { rows } = await pool.query(`select * from vehicle_models where id = $1`, [modelId]);
    if (rows.length === 0) throw new ModelNotFoundError(`model ${modelId} not found`);
    return rows[0];
  }

  values.push(modelId);
  try {
    const { rows } = await pool.query(
      `update vehicle_models set ${sets.join(", ")} where id = $${values.length} returning *`,
      values,
    );
    if (rows.length === 0) throw new ModelNotFoundError(`model ${modelId} not found`);
    return rows[0];
  } catch (err) {
    if (isUniqueViolation(err)) throw new ModelTakenError("this make/model combination already exists");
    throw err;
  }
}

// There is no delete: vehicles.model_id is ON DELETE RESTRICT, and a model with
// live vehicles must keep resolving. Deactivating only hides it from new
// createVehicle calls.
export async function deactivateModel(pool: Pool, adminId: string, modelId: string) {
  const { rowCount } = await pool.query(`update vehicle_models set is_active = false where id = $1`, [
    modelId,
  ]);
  if (!rowCount) throw new ModelNotFoundError(`model ${modelId} not found`);
}

export async function attachModelImage(pool: Pool, adminId: string, modelId: string, storageKey: string) {
  const { rows } = await pool.query(
    `update vehicle_models set image_key = $1 where id = $2 returning *`,
    [storageKey, modelId],
  );
  if (rows.length === 0) throw new ModelNotFoundError(`model ${modelId} not found`);
  return rows[0];
}
