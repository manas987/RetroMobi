import type { Pool } from "pg";
import { writeAudit } from "../../../lib/audit.ts";

export class LinkNotFoundError extends Error {}
export class AlreadyLinkedError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export async function listLicenceVehicles(pool: Pool, licenceId: string) {
  const { rows } = await pool.query(
    `select * from license_vehicles where license_id = $1 and removed_at is null order by added_at`,
    [licenceId],
  );
  return rows;
}

// Does not gate bookability -- linking/unlinking never touches vehicles.status
// or verification_status.
export async function linkVehicle(
  pool: Pool,
  adminId: string,
  licenceId: string,
  input: { vehicleId: string; registrationNumber: string },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let rows;
    try {
      ({ rows } = await client.query(
        `insert into license_vehicles (license_id, vehicle_id, registration_number)
         values ($1, $2, $3) returning *`,
        [licenceId, input.vehicleId, input.registrationNumber],
      ));
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AlreadyLinkedError(`vehicle ${input.vehicleId} already has a live licence link`);
      }
      throw err;
    }
    await writeAudit(client, {
      actorType: "ADMIN",
      actorId: adminId,
      action: "licence_vehicle.linked",
      entityType: "license_vehicle",
      entityId: rows[0].id,
      after: { licenceId, vehicleId: input.vehicleId },
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

export async function unlinkVehicle(pool: Pool, adminId: string, linkId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `update license_vehicles set removed_at = now() where id = $1 and removed_at is null`,
      [linkId],
    );
    if (!rowCount) throw new LinkNotFoundError(`licence-vehicle link ${linkId} not found`);
    await writeAudit(client, {
      actorType: "ADMIN",
      actorId: adminId,
      action: "licence_vehicle.unlinked",
      entityType: "license_vehicle",
      entityId: linkId,
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
