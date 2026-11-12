// Local marketplace and booking scenarios. Run after migrations: bun src/DB/seedDemo.ts
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { pool } from "./client.ts";
import { istDate } from "../lib/licenceGate.ts";
import { composeTotal, priceRental } from "../lib/pricing.ts";
import { createRider } from "../test/fixtures.ts";

const merchantPhone = "+919812340001";
const branches = [
  ["Rajpur Road", "Dehradun", "248001", 30.3332, 78.0559],
  ["Clock Tower", "Dehradun", "248001", 30.3255, 78.0420],
  ["Clement Town", "Dehradun", "248002", 30.2674, 78.0140],
  ["Prem Nagar", "Dehradun", "248007", 30.3326, 77.9640],
  ["Tapovan", "Rishikesh", "249192", 30.1318, 78.3238],
  ["Triveni Ghat", "Rishikesh", "249201", 30.1026, 78.2941],
  ["Shivpuri", "Rishikesh", "249192", 30.1288, 78.3869],
  ["Har Ki Pauri", "Haridwar", "249401", 29.9560, 78.1734],
  ["Jwalapur", "Haridwar", "249407", 29.9197, 78.1119],
  ["Bhupatwala", "Haridwar", "249410", 29.9741, 78.1768],
] as const;
const models = [
  ["Honda", "Activa 6G", "PETROL", 110, "SCOOTER", 45000],
  ["TVS", "Jupiter 125", "PETROL", 125, "SCOOTER", 52000],
  ["Suzuki", "Access 125", "PETROL", 125, "SCOOTER", 55000],
  ["Ather", "450X", "ELECTRIC", null, "SCOOTER", 66000],
  ["Royal Enfield", "Classic 350", "PETROL", 349, "MOTORCYCLE", 100000],
  ["Yamaha", "Fascino 125", "PETROL", 125, "SCOOTER", 50000],
  ["Bajaj", "Pulsar NS200", "PETROL", 199, "MOTORCYCLE", 72000],
  ["TVS", "iQube", "ELECTRIC", null, "SCOOTER", 62000],
  ["Royal Enfield", "Hunter 350", "PETROL", 349, "MOTORCYCLE", 89000],
  ["Bajaj", "Chetak", "ELECTRIC", null, "SCOOTER", 64000],
  ["Royal Enfield", "Himalayan 450", "PETROL", 452, "MOTORCYCLE", 125000],
  ["Jawa", "42 Bobber", "PETROL", 334, "MOTORCYCLE", 108000],
] as const;

async function seedFleet(client: PoolClient, merchantId: string, unitsPerShop: number) {
  const modelIds: string[] = [];
  for (const [make, model, fuel, cc, type] of models) {
    const { rows } = await client.query(
      `insert into vehicle_models (make, model, fuel_type, engine_cc, class, body_type, seating_capacity)
       values ($1, $2, $3, $4, $5, $5, $6)
       on conflict (make, model) do nothing returning id`,
      [make, model, fuel, cc, type, model === "42 Bobber" ? 1 : 2],
    );
    const existing = rows[0] ?? (await client.query("select id from vehicle_models where make = $1 and model = $2", [make, model])).rows[0];
    modelIds.push(existing.id as string);
  }

  const fleet: string[] = [];
  for (const [index, [area, city, pincode, lat, lng]] of branches.entries()) {
    const name = `Demo Rentals · ${area}`;
    const existing = await client.query("select id from shops where merchant_user_id = $1 and name = $2 and deleted_at is null", [merchantId, name]);
    const shopId = existing.rows[0]?.id ?? (await client.query(
      `insert into shops (merchant_user_id, name, address_line1, city, state, pincode, latitude, longitude, verification_status)
       values ($1, $2, $3, $4, 'Uttarakhand', $5, $6, $7, 'VERIFIED') returning id`,
      [merchantId, name, `Demo pickup point, ${area}`, city, pincode, lat, lng],
    )).rows[0].id;
    await client.query(
      `insert into shop_members (merchant_user_id, shop_id, role) values ($1, $2, 'OWNER') on conflict do nothing`,
      [merchantId, shopId],
    );
    await client.query(
      `insert into shop_hours (shop_id, day_of_week, opens_at, closes_at)
       select $1, day, '08:00', '21:00' from generate_series(0, 6) as day on conflict do nothing`,
      [shopId],
    );

    const number = `DEMO-RAM-${index + 1}`;
    const licence = await client.query(
      "select id from shop_licenses where merchant_user_id = $1 and licence_number = $2 and deleted_at is null",
      [merchantId, number],
    );
    const licenceId = licence.rows[0]?.id ?? (await client.query(
      `insert into shop_licenses (merchant_user_id, licence_number, issuing_authority, issued_at, expires_at, status)
       values ($1, $2, 'Demo record', current_date - 30, current_date + 730, 'ACTIVE') returning id`,
      [merchantId, number],
    )).rows[0].id;
    await client.query("insert into license_shops (license_id, shop_id) values ($1, $2) on conflict do nothing", [licenceId, shopId]);

    for (let unit = 0; unit < unitsPerShop; unit++) {
      const modelIndex = (index * 3 + unit) % models.length;
      const amount = models[modelIndex]![5] + (index % 3) * 3000;
      const registration = `UK07DM${String(index + 1).padStart(2, "0")}${String(unit + 1).padStart(2, "0")}`;
      const inserted = await client.query<{ id: string }>(
        `insert into vehicles (shop_id, model_id, registration_number, status, verification_status)
         values ($1, $2, $3, 'ACTIVE', 'VERIFIED') on conflict (registration_number) do nothing returning id`,
        [shopId, modelIds[modelIndex], registration],
      );
      const vehicleId = inserted.rows[0]?.id ?? (await client.query<{ id: string }>(
        "select id from vehicles where shop_id = $1 and registration_number = $2 and deleted_at is null", [shopId, registration],
      )).rows[0]?.id;
      assert.ok(vehicleId, `Demo registration ${registration} is already in use`);
      await client.query(
        `insert into vehicle_pricing (vehicle_id, amount, weekend_amount, security_deposit_amount, late_fee_amount)
         values ($1, $2, $3, $4, 5000) on conflict (vehicle_id) do nothing`,
        [vehicleId, amount, amount + 10000, amount < 70000 ? 200000 : 400000],
      );
      await client.query(
        `insert into license_vehicles (license_id, vehicle_id, registration_number) values ($1, $2, $3) on conflict do nothing`,
        [licenceId, vehicleId, registration],
      );
      if (inserted.rowCount) {
        await client.query("insert into vehicle_accessories (vehicle_id, type, quantity) values ($1, 'HELMET', $2)", [vehicleId, unit % 2 + 1]);
      }
      fleet.push(vehicleId);
    }
  }
  return fleet;
}

async function seedBookings(client: PoolClient, userId: string, merchantId: string, fleet: string[], now: Date) {
  const hour = 3_600_000;
  const shift = (hours: number) => new Date(now.getTime() + hours * hour);
  const today = istDate(now);
  const todayPickup = new Date(Math.max(Date.parse(`${today}T00:00:00+05:30`), shift(-1).getTime()));
  const scenarios = [
    { key: "completed", from: shift(-168), to: shift(-144), collected: true, returned: true },
    { key: "upcoming", from: shift(168), to: shift(216), collected: false, returned: false },
    { key: "awaiting-return", from: shift(-26), to: shift(2), collected: true, returned: false },
    { key: "pickup-today", from: todayPickup, to: shift(25), collected: false, returned: false },
  ];

  let inserted = 0;
  for (const scenario of scenarios) {
    const reference = `demo-${userId}-${scenario.key}`;
    const existing = await client.query("select 1 from payments where provider_payment_id = $1", [reference]);
    if (existing.rowCount) continue;
    const { rows: [vehicle] } = await client.query(
      `select v.id, vp.amount, vp.weekend_amount, vp.security_deposit_amount
         from unnest($1::uuid[]) with ordinality as fleet(id, rank)
         join vehicles v on v.id = fleet.id join vehicle_pricing vp on vp.vehicle_id = v.id
        where v.deleted_at is null
          and not exists (select 1 from bookings b where b.vehicle_id = v.id and b.deleted_at is null
            and tstzrange(b.scheduled_pickup_at,b.scheduled_return_at) && tstzrange($2::timestamptz,$3::timestamptz))
          and not exists (select 1 from vehicle_unavailability u where u.vehicle_id = v.id
            and tstzrange(u.start_at,u.end_at) && tstzrange($2::timestamptz,$3::timestamptz))
        order by fleet.rank limit 1`,
      [fleet, scenario.from, scenario.to],
    );
    assert.ok(vehicle, `No demo vehicle available for ${scenario.key}`);

    const rider = await createRider(client, userId);
    await client.query("update riders set name = $2 where id = $1", [rider.id, scenario.key === "pickup-today" ? "Demo Pickup Rider" : "Demo Rider"]);
    const deposit = Number(vehicle.security_deposit_amount);
    const { rentalAmount } = priceRental({
      pickupAt: scenario.from,
      returnAt: scenario.to,
      pricing: { amount: Number(vehicle.amount), weekendAmount: Number(vehicle.weekend_amount), securityDepositAmount: deposit },
      specialPricings: [],
    });
    const quote = composeTotal({
      rentalAmount, securityDepositAmount: deposit, discountAmount: 0,
      platformFeePct: Number(process.env.PLATFORM_FEE_PCT ?? 10), gstRate: Number(process.env.GST_RATE ?? 18),
    });
    const created = new Date(Math.min(now.getTime(), scenario.from.getTime() - hour));
    const { rows: [group] } = await client.query(
      "insert into booking_groups (user_id, total_amount, created_at) values ($1, $2, $3) returning id",
      [userId, quote.totalAmount, created],
    );
    const actualPickup = scenario.collected ? scenario.from : null;
    const actualReturn = scenario.returned ? scenario.to : null;
    const { rows: [booking] } = await client.query(
      `insert into bookings (group_id, rider_id, vehicle_id, scheduled_pickup_at, scheduled_return_at,
         actual_pickup_at, actual_return_at, status, rental_amount, security_deposit_amount, platform_fee,
         tax_amount, total_amount, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
      [group.id, rider.id, vehicle.id, scenario.from, scenario.to, actualPickup, actualReturn,
        scenario.returned ? "COMPLETED" : "CONFIRMED", rentalAmount, deposit, quote.platformFee, quote.taxAmount, quote.totalAmount, created],
    );
    await client.query(
      `insert into payments (booking_group_id, provider_order_id, provider_payment_id, type, amount, status, created_at)
       values ($1, $2, $3, 'RENTAL', $4, 'SUCCEEDED', $5)`,
      [group.id, `order_${group.id}`, reference, quote.totalAmount, created],
    );
    await client.query(
      `insert into security_deposits (booking_id, amount, status, held_at, released_at, refund_amount)
       values ($1, $2, $3, $4, $5, $6)`,
      [booking.id, deposit, scenario.returned ? "RELEASED" : "HELD", created, actualReturn, scenario.returned ? deposit : 0],
    );
    if (actualPickup) {
      await client.query(
        `insert into pickup_identity_checks (booking_id, rider_id, checked_by, photo_matched, physical_dl_seen, dl_number_last4, created_at)
         select $1, $2, $3, true, true, right(licence_number, 4), $4
           from driving_licence_verifications where rider_id = $2`,
        [booking.id, rider.id, merchantId, actualPickup],
      );
    }
    inserted++;
  }
  return inserted;
}

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Demo data can only be seeded into a local development database");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('retromobi-demo-seed'))");
    await client.query(
      "insert into users (phone, name) values ('+919812340002', 'Test Customer') on conflict (phone) do nothing",
    );
    const { rows: customers } = await client.query("select id from users where status = 'ACTIVE' and deleted_at is null order by created_at, id");
    await client.query("insert into merchant_users (phone, name) values ($1, 'Test Merchant') on conflict (phone) do nothing", [merchantPhone]);
    const { rows: [merchant] } = await client.query("select id from merchant_users where phone = $1", [merchantPhone]);
    const fleet = await seedFleet(client, merchant.id, Math.max(5, Math.ceil(customers.length * 2 / branches.length) + 3));
    const now = new Date();
    let inserted = 0;
    for (const [index, customer] of customers.entries()) {
      const offset = index * 5 % fleet.length;
      inserted += await seedBookings(client, customer.id, merchant.id, [...fleet.slice(offset), ...fleet.slice(0, offset)], now);
    }
    // The customer can try the pickup upload immediately after the simulated staff check.
    await client.query(
      `insert into pickup_identity_checks (booking_id, rider_id, checked_by, photo_matched, physical_dl_seen, dl_number_last4)
       select b.id, b.rider_id, $1, true, true, right(dlv.licence_number, 4)
         from bookings b
         join booking_groups g on g.id = b.group_id
         join payments p on p.booking_group_id = g.id
         join driving_licence_verifications dlv on dlv.rider_id = b.rider_id and dlv.status = 'VERIFIED'
        where p.provider_payment_id = 'demo-' || g.user_id || '-pickup-today'
          and b.status = 'CONFIRMED' and b.actual_pickup_at is null and b.deleted_at is null
       on conflict (booking_id) do nothing`,
      [merchant.id],
    );
    await client.query("commit");
    console.log(`${branches.length} demo shops, ${fleet.length} vehicles, ${inserted} new bookings across ${customers.length} active customer accounts.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => pool.end());
