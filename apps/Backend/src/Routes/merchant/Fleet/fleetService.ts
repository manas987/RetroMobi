import type { Pool } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import { can, type ShopRole } from "../../../lib/permissions.ts";
import { assertOwnUpload, storedContentType } from "../../../lib/storage.ts";
import type { TrackerClient } from "../../../providers/tracker.ts";
import { ShopNotFoundError } from "../Shops/shopsService.ts";

export class VehicleNotFoundError extends Error {}
export class VehicleHasActiveBookingsError extends Error {}
export class ModelNotFoundError extends Error {}
export class RegistrationTakenError extends Error {}
export class TrackerAlreadyAssignedError extends Error {}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;
}

/** End of the block (servicing etc.) covering right now, null when none. */
const BLOCKED_UNTIL = `(select max(u.end_at) from vehicle_unavailability u
  where u.vehicle_id = v.id and u.start_at <= now() and u.end_at > now()) as blocked_until`;

export async function listVehicles(pool: Pool, shopId: string) {
  // `vehicle_pricing` is a LEFT join on purpose: adding a vehicle writes the
  // row and its pricing in two separate calls, so a vehicle whose second call
  // failed has no pricing and must still appear in the fleet list — with a
  // visibly missing rate rather than vanishing from the page that is the only
  // place to fix it.
  const { rows } = await pool.query(
    `select v.*, m.make, m.model,
            vp.amount, vp.weekend_amount, vp.security_deposit_amount, vp.late_fee_amount, ${BLOCKED_UNTIL}
       from vehicles v
       join vehicle_models m on m.id = v.model_id
       left join vehicle_pricing vp on vp.vehicle_id = v.id
      where v.shop_id = $1 and v.deleted_at is null
      order by v.created_at desc`,
    [shopId],
  );
  return rows;
}

export async function getVehicle(pool: Pool, vehicleId: string) {
  const { rows } = await pool.query(
    `select v.*, m.make, m.model, ${BLOCKED_UNTIL}
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

/** UNVERIFIED/REJECTED -> PENDING, mirroring the shop's own submit. */
export async function submitVehicleForVerification(pool: Pool, merchantUserId: string, vehicleId: string) {
  const { rows } = await pool.query(
    `update vehicles set verification_status = 'PENDING', updated_at = now()
      where id = $1 and deleted_at is null and verification_status in ('UNVERIFIED', 'REJECTED')
      returning id, verification_status`,
    [vehicleId],
  );
  if (rows.length === 0) throw new VehicleNotFoundError(`vehicle ${vehicleId} not found or not eligible`);
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "vehicle.submitted_for_checking",
    entityType: "vehicle",
    entityId: vehicleId,
  });
  return rows[0];
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
  const changed: Record<string, unknown> = {};
  if (input.color !== undefined) changed.color = input.color;
  if (input.manufacturingDate !== undefined) changed.manufacturingDate = input.manufacturingDate;
  if (input.status !== undefined) changed.status = input.status;
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: input.status !== undefined ? "vehicle.listing_changed" : "vehicle.updated",
    entityType: "vehicle",
    entityId: vehicleId,
    after: input.status !== undefined ? { status: input.status } : changed,
  });
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
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "vehicle.deleted",
    entityType: "vehicle",
    entityId: vehicleId,
  });
}

/**
 * Moves a vehicle to another branch of the same owner. The caller already has
 * fleet:write on the source shop (route middleware); they need it on the
 * target too. Bookings have no shop of their own, so the vehicle's past rides
 * and money show under the new branch from now on (the owner's choice). A
 * vehicle with a live booking stays put: the customer was told where to collect it.
 */
export async function moveVehicle(pool: Pool, merchantUserId: string, vehicleId: string, toShopId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: vRows } = await client.query(
      `select v.id, v.shop_id, s.merchant_user_id as owner_id, s.name as shop_name
         from vehicles v join shops s on s.id = v.shop_id
        where v.id = $1 and v.deleted_at is null
        for update of v`,
      [vehicleId],
    );
    const vehicle = vRows[0];
    if (!vehicle) throw new VehicleNotFoundError(`vehicle ${vehicleId} not found`);

    // Another owner's shop, a deleted one, or one where the caller can't manage
    // vehicles all read as "not found": nothing about other shops leaks.
    const { rows: tRows } = await client.query(
      `select s.id, s.name, s.merchant_user_id, m.role
         from shops s
         join shop_members m on m.shop_id = s.id and m.merchant_user_id = $2
                            and m.status = 'ACTIVE' and m.deleted_at is null
        where s.id = $1 and s.deleted_at is null`,
      [toShopId, merchantUserId],
    );
    const target = tRows[0];
    if (!target || target.merchant_user_id !== vehicle.owner_id || !can(target.role as ShopRole, "fleet:write")) {
      throw new ShopNotFoundError(`shop ${toShopId} not found`);
    }
    if (target.id === vehicle.shop_id) {
      await client.query("COMMIT");
      return getVehicle(pool, vehicleId);
    }

    const { rows: live } = await client.query(
      `select 1 from bookings
        where vehicle_id = $1 and status in ('HOLD', 'CONFIRMED') and deleted_at is null
        limit 1`,
      [vehicleId],
    );
    if (live.length > 0) throw new VehicleHasActiveBookingsError("vehicle has a live booking and cannot move");

    await client.query(`update vehicles set shop_id = $2, updated_at = now() where id = $1`, [vehicleId, target.id]);
    // One row per branch, so both activity logs show the move.
    for (const shopId of [vehicle.shop_id, target.id]) {
      await writeAudit(client, {
        actorType: "MERCHANT",
        actorId: merchantUserId,
        action: "vehicle.moved",
        entityType: "vehicle",
        entityId: vehicleId,
        shopId,
        // The activity log reads only `after`, so both ends live there.
        after: { fromShopId: vehicle.shop_id, from: vehicle.shop_name, toShopId: target.id, to: target.name },
      });
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getVehicle(pool, vehicleId);
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
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "vehicle.registration_updated",
    entityType: "vehicle",
    entityId: vehicleId,
  });
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
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "vehicle.document_added",
    entityType: "vehicle",
    entityId: vehicleId,
      after: { type: input.type },
  });
  return rows[0];
}

/**
 * `PUT /registration` appends a new row every time rather than updating, so
 * "the" registration record is the newest one. Returns null rather than
 * throwing when none has been filed — a vehicle with no record is ordinary,
 * not an error.
 */
export async function getRegistrationRecord(pool: Pool, vehicleId: string) {
  const { rows } = await pool.query(
    `select * from vehicle_registration_records where vehicle_id = $1
      order by verified_at desc nulls last, id desc limit 1`,
    [vehicleId],
  );
  return rows[0] ?? null;
}

async function requireDocument(pool: Pool, vehicleId: string, documentId: string) {
  const { rows } = await pool.query(
    `select * from vehicle_documents where id = $1 and vehicle_id = $2 and deleted_at is null`,
    [documentId, vehicleId],
  );
  if (rows.length === 0) throw new VehicleNotFoundError(`document ${documentId} not found on this vehicle`);
  return rows[0];
}

export async function attachDocumentFile(
  pool: Pool,
  merchantUserId: string,
  vehicleId: string,
  documentId: string,
  storageKey: string,
) {
  // Pinned to the vehicle in the URL: requirePermission only vouches for that
  // vehicle's shop, not for whichever document id the caller names.
  assertOwnUpload(storageKey, `vehicles/${vehicleId}/documents/${documentId}/`);
  const { rows } = await pool.query(
    `update vehicle_documents set storage_key = $1, updated_at = now()
      where id = $2 and vehicle_id = $3 and deleted_at is null returning *`,
    [storageKey, documentId, vehicleId],
  );
  if (rows.length === 0) throw new VehicleNotFoundError(`document ${documentId} not found`);
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "vehicle.document_uploaded",
    entityType: "vehicle_document",
    entityId: documentId,
    after: { type: rows[0].type },
  });
  return rows[0];
}

export class NoFileError extends Error {}

/** Vehicle scope is already enforced by `requirePermission` resolving the
 *  shop from `:vehicleId`; `requireDocument` pins the document to that
 *  vehicle, so a presigned GET can never cross to another shop's paperwork. */
export async function getDocumentStorageKey(pool: Pool, vehicleId: string, documentId: string): Promise<string> {
  const doc = await requireDocument(pool, vehicleId, documentId);
  if (!doc.storage_key) throw new NoFileError(`document ${documentId} has no file attached`);
  return doc.storage_key;
}

export async function softDeleteDocument(pool: Pool, merchantUserId: string, vehicleId: string, documentId: string) {
  const doc = await requireDocument(pool, vehicleId, documentId);
  await pool.query(`update vehicle_documents set deleted_at = now(), updated_at = now() where id = $1`, [documentId]);
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "vehicle.document_removed",
    entityType: "vehicle",
    entityId: vehicleId,
      after: { type: doc.type },
  });
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
  assertOwnUpload(input.storageKey, `vehicles/${vehicleId.toLowerCase()}/media/`);
  const { rows } = await pool.query(
    `insert into vehicle_media (vehicle_id, storage_key, type, display_order)
     values ($1, $2, $3, $4) returning *`,
    [vehicleId, input.storageKey, input.type, input.displayOrder ?? 0],
  );
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "vehicle.photo_added",
    entityType: "vehicle",
    entityId: vehicleId,
  });
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
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "vehicle.photo_removed",
    entityType: "vehicle",
    entityId: vehicleId,
  });
}

export async function getMediaStorageKey(pool: Pool, vehicleId: string, mediaId: string): Promise<string> {
  const { rows } = await pool.query(
    `select storage_key from vehicle_media where id = $1 and vehicle_id = $2 and deleted_at is null`,
    [mediaId, vehicleId],
  );
  if (rows.length === 0) throw new VehicleNotFoundError(`media ${mediaId} not found on this vehicle`);
  return rows[0].storage_key;
}

// merchantUserId is last and optional so the audit row is written only when a merchant did it.
export async function setMediaPublication(
  pool: Pool,
  vehicleId: string,
  mediaId: string,
  published: boolean,
  merchantUserId?: string,
) {
  if (published) {
    const key = await getMediaStorageKey(pool, vehicleId, mediaId);
    const prefix = `vehicles/${vehicleId}/media/`;
    if (!key.startsWith(prefix) || !/^(?:\d{13}|[0-9a-f-]{36})$/.test(key.slice(prefix.length))) return false;
    const contentType = await storedContentType(key);
    if (!contentType || !/^image\/(jpeg|png|webp|avif|gif)$/.test(contentType)) return false;
  }

  const { rowCount } = await pool.query(
    `update vehicle_media set published = $3
      where id = $1 and vehicle_id = $2 and deleted_at is null and type = 'IMAGE'`,
    [mediaId, vehicleId, published],
  );
  if (!rowCount) throw new VehicleNotFoundError(`media ${mediaId} not found on this vehicle`);
  if (merchantUserId) {
    await writeAudit(pool, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "vehicle.photo_visibility",
      entityType: "vehicle",
      entityId: vehicleId,
      after: { published },
    });
  }
  return true;
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
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "vehicle.blocked",
    entityType: "vehicle",
    entityId: vehicleId,
      after: { startAt: input.startAt, endAt: input.endAt, reason: input.reason ?? null },
  });
  return rows[0];
}

export async function deleteUnavailability(pool: Pool, merchantUserId: string, vehicleId: string, blockId: string) {
  const { rowCount } = await pool.query(
    `delete from vehicle_unavailability where id = $1 and vehicle_id = $2`,
    [blockId, vehicleId],
  );
  if (!rowCount) throw new VehicleNotFoundError(`unavailability block ${blockId} not found on this vehicle`);
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "vehicle.unblocked",
    entityType: "vehicle",
    entityId: vehicleId,
  });
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
