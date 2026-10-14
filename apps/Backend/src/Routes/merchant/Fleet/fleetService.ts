import type { Pool } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import type { TrackerClient } from "../../../providers/tracker.ts";

export class VehicleNotFoundError extends Error {}
export class VehicleHasActiveBookingsError extends Error {}
export class ModelNotFoundError extends Error {}
export class RegistrationTakenError extends Error {}
export class TrackerAlreadyAssignedError extends Error {}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;
}

export async function listVehicles(pool: Pool, shopId: string) {
  const { rows } = await pool.query(
    `select v.*, m.make, m.model
       from vehicles v
       join vehicle_models m on m.id = v.model_id
      where v.shop_id = $1 and v.deleted_at is null
      order by v.created_at desc`,
    [shopId],
  );
  return rows;
}

export async function getVehicle(pool: Pool, vehicleId: string) {
  const { rows } = await pool.query(
    `select v.*, m.make, m.model
       from vehicles v
       join vehicle_models m on m.id = v.model_id
      where v.id = $1 and v.deleted_at is null`,
    [vehicleId],
  );
  if (rows.length === 0) throw new VehicleNotFoundError(`vehicle ${vehicleId} not found`);
  return rows[0];
}

export async function createVehicle(
  pool: Pool,
  merchantUserId: string,
  shopId: string,
  input: { modelId: string; registrationNumber: string; manufacturingDate?: string; color?: string },
) {
  const { rows: modelRows } = await pool.query(
    `select id from vehicle_models where id = $1 and is_active = true`,
    [input.modelId],
  );
  if (modelRows.length === 0) throw new ModelNotFoundError(`model ${input.modelId} not found`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `insert into vehicles (shop_id, model_id, registration_number, manufacturing_date, color)
       values ($1, $2, $3, $4, $5) returning *`,
      [shopId, input.modelId, input.registrationNumber, input.manufacturingDate ?? null, input.color ?? null],
    );
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "vehicle.created",
      entityType: "vehicle",
      entityId: rows[0].id,
      after: { registrationNumber: input.registrationNumber, shopId },
    });
    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(err)) {
      throw new RegistrationTakenError(`registration number ${input.registrationNumber} is already in use`);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function updateVehicle(
  pool: Pool,
  merchantUserId: string,
  vehicleId: string,
  input: { color?: string; manufacturingDate?: string; status?: "ACTIVE" | "INACTIVE" },
) {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.color !== undefined) {
    values.push(input.color);
    sets.push(`color = $${values.length}`);
  }
  if (input.manufacturingDate !== undefined) {
    values.push(input.manufacturingDate);
    sets.push(`manufacturing_date = $${values.length}`);
  }
  if (input.status !== undefined) {
    values.push(input.status);
    sets.push(`status = $${values.length}`);
  }
  if (sets.length === 0) return getVehicle(pool, vehicleId);

  values.push(vehicleId);
  const { rows } = await pool.query(
    `update vehicles set ${sets.join(", ")}, updated_at = now()
      where id = $${values.length} and deleted_at is null
      returning *`,
    values,
  );
  if (rows.length === 0) throw new VehicleNotFoundError(`vehicle ${vehicleId} not found`);
  return rows[0];
}

export async function softDeleteVehicle(pool: Pool, merchantUserId: string, vehicleId: string) {
  const { rows: activeBookings } = await pool.query(
    `select 1 from bookings
      where vehicle_id = $1 and status in ('HOLD', 'CONFIRMED') and deleted_at is null
      limit 1`,
    [vehicleId],
  );
  if (activeBookings.length > 0) {
    throw new VehicleHasActiveBookingsError("vehicle has active bookings and cannot be deleted");
  }

  const { rowCount } = await pool.query(
    `update vehicles set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null`,
    [vehicleId],
  );
  if (!rowCount) throw new VehicleNotFoundError(`vehicle ${vehicleId} not found`);
}

export interface RegistrationRecordInput {
  registrationNumber: string;
  registrationDate?: string;
  registeringAuthority?: string;
  engineNumber?: string;
  chassisNumber?: string;
  manufacturer?: string;
  model?: string;
  vehicleClass?: string;
  bodyType?: string;
  fuelType?: string;
  color?: string;
  manufacturingDate?: string;
  seatingCapacity?: number;
  grossWeight?: number;
  unladenWeight?: number;
  cubicCapacity?: number;
  financer?: string;
  taxValidUntil?: string;
  statusDate?: string;
}

export async function upsertRegistrationRecord(
  pool: Pool,
  merchantUserId: string,
  vehicleId: string,
  input: RegistrationRecordInput,
) {
  await getVehicle(pool, vehicleId);
  await pool.query(
    `insert into vehicle_registration_records
       (vehicle_id, registration_number, registration_date, registering_authority, engine_number,
        chassis_number, manufacturer, model, vehicle_class, body_type, fuel_type, color,
        manufacturing_date, seating_capacity, gross_weight, unladen_weight, cubic_capacity,
        financer, tax_valid_until, status_date, verified_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now())`,
    [
      vehicleId,
      input.registrationNumber,
      input.registrationDate ?? null,
      input.registeringAuthority ?? null,
      input.engineNumber ?? null,
      input.chassisNumber ?? null,
      input.manufacturer ?? null,
      input.model ?? null,
      input.vehicleClass ?? null,
      input.bodyType ?? null,
      input.fuelType ?? null,
      input.color ?? null,
      input.manufacturingDate ?? null,
      input.seatingCapacity ?? null,
      input.grossWeight ?? null,
      input.unladenWeight ?? null,
      input.cubicCapacity ?? null,
      input.financer ?? null,
      input.taxValidUntil ?? null,
      input.statusDate ?? null,
    ],
  );
}

export async function listDocuments(pool: Pool, vehicleId: string) {
  const { rows } = await pool.query(
    `select * from vehicle_documents where vehicle_id = $1 and deleted_at is null order by created_at desc`,
    [vehicleId],
  );
  return rows;
}

export type VehicleDocType = "RC" | "INSURANCE" | "FITNESS" | "PUC" | "PERMIT" | "TAX";

export async function createDocument(
  pool: Pool,
  merchantUserId: string,
  vehicleId: string,
  input: { type: VehicleDocType; documentNumber?: string; issuedAt?: string; expiresAt?: string },
) {
  const { rows } = await pool.query(
    `insert into vehicle_documents (vehicle_id, type, document_number, issued_at, expires_at, status)
     values ($1, $2, $3, $4, $5, 'PENDING') returning *`,
    [vehicleId, input.type, input.documentNumber ?? null, input.issuedAt ?? null, input.expiresAt ?? null],
  );
  return rows[0];
}

async function requireDocument(pool: Pool, vehicleId: string, documentId: string) {
  const { rows } = await pool.query(
    `select * from vehicle_documents where id = $1 and vehicle_id = $2 and deleted_at is null`,
    [documentId, vehicleId],
  );
  if (rows.length === 0) throw new VehicleNotFoundError(`document ${documentId} not found on this vehicle`);
  return rows[0];
}

export async function attachDocumentFile(pool: Pool, merchantUserId: string, documentId: string, storageKey: string) {
  const { rows } = await pool.query(
    `update vehicle_documents set storage_key = $1, updated_at = now()
      where id = $2 and deleted_at is null returning *`,
    [storageKey, documentId],
  );
  if (rows.length === 0) throw new VehicleNotFoundError(`document ${documentId} not found`);
  return rows[0];
}

export async function softDeleteDocument(pool: Pool, merchantUserId: string, vehicleId: string, documentId: string) {
  await requireDocument(pool, vehicleId, documentId);
  await pool.query(`update vehicle_documents set deleted_at = now(), updated_at = now() where id = $1`, [documentId]);
}

export async function listMedia(pool: Pool, vehicleId: string) {
  const { rows } = await pool.query(
    `select * from vehicle_media where vehicle_id = $1 and deleted_at is null order by display_order, created_at`,
    [vehicleId],
  );
  return rows;
}

export async function addMedia(
  pool: Pool,
  merchantUserId: string,
  vehicleId: string,
  input: { storageKey: string; type: "IMAGE" | "VIDEO"; displayOrder?: number },
) {
  const { rows } = await pool.query(
    `insert into vehicle_media (vehicle_id, storage_key, type, display_order)
     values ($1, $2, $3, $4) returning *`,
    [vehicleId, input.storageKey, input.type, input.displayOrder ?? 0],
  );
  return rows[0];
}

export async function reorderMedia(
  pool: Pool,
  merchantUserId: string,
  vehicleId: string,
  order: Array<{ id: string; displayOrder: number }>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of order) {
      await client.query(
        `update vehicle_media set display_order = $1 where id = $2 and vehicle_id = $3`,
        [item.displayOrder, item.id, vehicleId],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function softDeleteMedia(pool: Pool, merchantUserId: string, vehicleId: string, mediaId: string) {
  const { rowCount } = await pool.query(
    `update vehicle_media set deleted_at = now() where id = $1 and vehicle_id = $2 and deleted_at is null`,
    [mediaId, vehicleId],
  );
  if (!rowCount) throw new VehicleNotFoundError(`media ${mediaId} not found on this vehicle`);
}

export async function listAccessories(pool: Pool, vehicleId: string) {
  const { rows } = await pool.query(`select * from vehicle_accessories where vehicle_id = $1`, [vehicleId]);
  return rows;
}

export async function setAccessory(
  pool: Pool,
  merchantUserId: string,
  vehicleId: string,
  input: { type: string; quantity: number; status: "AVAILABLE" | "UNAVAILABLE" },
) {
  const { rows } = await pool.query(
    `insert into vehicle_accessories (vehicle_id, type, quantity, status) values ($1, $2, $3, $4) returning *`,
    [vehicleId, input.type, input.quantity, input.status],
  );
  return rows[0];
}

export async function deleteAccessory(pool: Pool, merchantUserId: string, vehicleId: string, accessoryId: string) {
  const { rowCount } = await pool.query(
    `delete from vehicle_accessories where id = $1 and vehicle_id = $2`,
    [accessoryId, vehicleId],
  );
  if (!rowCount) throw new VehicleNotFoundError(`accessory ${accessoryId} not found on this vehicle`);
}

export async function listUnavailability(pool: Pool, vehicleId: string) {
  const { rows } = await pool.query(
    `select * from vehicle_unavailability where vehicle_id = $1 order by start_at`,
    [vehicleId],
  );
  return rows;
}

export async function addUnavailability(
  pool: Pool,
  merchantUserId: string,
  vehicleId: string,
  input: { startAt: Date; endAt: Date; reason?: string },
) {
  const { rows } = await pool.query(
    `insert into vehicle_unavailability (vehicle_id, start_at, end_at, reason) values ($1, $2, $3, $4) returning *`,
    [vehicleId, input.startAt, input.endAt, input.reason ?? null],
  );
  return rows[0];
}

export async function deleteUnavailability(pool: Pool, merchantUserId: string, vehicleId: string, blockId: string) {
  const { rowCount } = await pool.query(
    `delete from vehicle_unavailability where id = $1 and vehicle_id = $2`,
    [blockId, vehicleId],
  );
  if (!rowCount) throw new VehicleNotFoundError(`unavailability block ${blockId} not found on this vehicle`);
}

export async function assignTracker(
  pool: Pool,
  merchantUserId: string,
  vehicleId: string,
  input: { provider?: string; deviceIdentifier: string },
) {
  const provider = input.provider ?? "FLESPI";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: trackerRows } = await client.query(
      `insert into trackers (provider, device_identifier, status)
       values ($1, $2, 'ACTIVE')
       on conflict (provider, device_identifier) do update set status = 'ACTIVE'
       returning id`,
      [provider, input.deviceIdentifier],
    );
    const trackerId = trackerRows[0].id;

    await client.query(
      `update vehicle_tracker_assignments set unassigned_at = now()
        where vehicle_id = $1 and unassigned_at is null`,
      [vehicleId],
    );

    try {
      await client.query(
        `insert into vehicle_tracker_assignments (vehicle_id, tracker_id) values ($1, $2)`,
        [vehicleId, trackerId],
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new TrackerAlreadyAssignedError(`vehicle ${vehicleId} already has an active tracker`);
      }
      throw err;
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function unassignTracker(pool: Pool, merchantUserId: string, vehicleId: string) {
  await pool.query(
    `update vehicle_tracker_assignments set unassigned_at = now()
      where vehicle_id = $1 and unassigned_at is null`,
    [vehicleId],
  );
}

// Read-only passthrough. No telemetry stored in our own DB.
export async function getVehicleLocation(pool: Pool, vehicleId: string, tracker: TrackerClient) {
  const { rows } = await pool.query(
    `select t.device_identifier
       from vehicle_tracker_assignments a
       join trackers t on t.id = a.tracker_id
      where a.vehicle_id = $1 and a.unassigned_at is null`,
    [vehicleId],
  );
  if (rows.length === 0) return null;
  return tracker.getLastPosition(rows[0].device_identifier);
}
