import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { uniquePhone } from "../../../test/fixtures.ts";
import {
  AdminNotRecognizedError,
  requestAdminOtp,
  verifyAdminOtp,
} from "./adminAuthService.ts";
import { verifyAdminAccessToken } from "./token.ts";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

const DEVICE = "admin-test-device";
const noopDeliver = async () => {};

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

describe("admin auth", () => {
  test("an unprovisioned phone is rejected before any OTP is sent", async () => {
    const phone = uniquePhone();
    await expect(requestAdminOtp(pool, phone, noopDeliver)).rejects.toBeInstanceOf(
      AdminNotRecognizedError,
    );
    const { rows } = await pool.query(`select 1 from admin_otp_challenges where target = $1`, [phone]);
    expect(rows).toHaveLength(0);
  });

  test("a provisioned ACTIVE admin logs in and gets an admin-audience token carrying their role", async () => {
    const phone = uniquePhone();
    await pool.query(
      `insert into admins (phone, name, role) values ($1, 'Test Admin', 'SUPPORT')`,
      [phone],
    );

    const challenge = await requestAdminOtp(pool, phone, noopDeliver);
    const login = await verifyAdminOtp(pool, { phone, code: challenge.code, deviceId: DEVICE });

    expect(login.admin.role).toBe("SUPPORT");
    const payload = verifyAdminAccessToken(login.accessToken);
    expect(payload?.role).toBe("SUPPORT");
    expect(payload?.aid).toBe(login.admin.id);
  });

  test("a suspended admin cannot log in even with the right code", async () => {
    const phone = uniquePhone();
    await pool.query(
      `insert into admins (phone, name, role, status) values ($1, 'Suspended', 'ADMIN', 'SUSPENDED')`,
      [phone],
    );
    await expect(requestAdminOtp(pool, phone, noopDeliver)).rejects.toBeInstanceOf(
      AdminNotRecognizedError,
    );
  });
});
