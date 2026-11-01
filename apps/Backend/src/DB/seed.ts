// Dummy data for local/dev browsing — adds to whatever is already in the DB,
// never truncates. Run with: bun src/DB/seed.ts
import crypto from "node:crypto";
import { pool } from "./client.ts";

const salt = crypto.randomInt(0, 1_000_000_000).toString(36);
let seq = 0;
const uniq = () => `${salt}${(seq += 1)}`;
const phone = () => `+9198${((crypto.randomInt(0, 1_000_000_000) + seq) % 10_000_000).toString().padStart(7, "0")}`;
const reg = () => `UK07${uniq().toUpperCase().slice(0, 8)}`;

async function createMerchant(name: string) {
  const { rows } = await pool.query(
    `insert into merchant_users (phone, email, name) values ($1, $2, $3) returning id`,
    [phone(), `${uniq()}@seed.retromobi.dev`, name],
  );
  return rows[0].id as string;
}

async function createShop(merchantId: string, opts: {
  name: string; city: string; lat: number; lng: number; rating?: number; reviewCount?: number;
}) {
  const { rows } = await pool.query(
    `insert into shops (merchant_user_id, name, address_line1, city, state, pincode, latitude, longitude, gstin, rating, review_count)
     values ($1, $2, $3, $4, 'Uttarakhand', '248001', $5, $6, '05AAAAA0000A1Z5', $7, $8)
     returning id`,
    [merchantId, opts.name, `${1 + (seq % 90)} Mall Road`, opts.city, opts.lat, opts.lng, opts.rating ?? null, opts.reviewCount ?? 0],
  );
  return rows[0].id as string;
}

async function findOrCreateModel(m: {
  make: string; model: string; fuelType: "PETROL" | "ELECTRIC"; engineCc?: number; bodyType: string; seats?: number;
}) {
  const existing = await pool.query(`select id from vehicle_models where make = $1 and model = $2`, [m.make, m.model]);
  if (existing.rows[0]) return existing.rows[0].id as string;
  const { rows } = await pool.query(
    `insert into vehicle_models (make, model, class, fuel_type, engine_cc, body_type, seating_capacity)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [m.make, m.model, m.bodyType === "MOTORCYCLE" ? "MOTORCYCLE" : "SCOOTER", m.fuelType, m.engineCc ?? null, m.bodyType, m.seats ?? 2],
  );
  return rows[0].id as string;
}

/** Creates `count` ACTIVE vehicles of one model at one shop, with pricing. */
async function createFleet(shopId: string, modelId: string, count: number, pricing: {
  amount: number; weekendAmount: number; depositAmount: number;
}) {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const { rows } = await pool.query(
      `insert into vehicles (shop_id, model_id, registration_number, status, verification_status)
       values ($1, $2, $3, 'ACTIVE', 'VERIFIED') returning id`,
      [shopId, modelId, reg()],
    );
    const vehicleId = rows[0].id as string;
    await pool.query(
      `insert into vehicle_pricing (vehicle_id, amount, weekend_amount, security_deposit_amount, late_fee_amount)
       values ($1, $2, $3, $4, 5000)`,
      [vehicleId, pricing.amount, pricing.weekendAmount, pricing.depositAmount],
    );
    ids.push(vehicleId);
  }
  return ids;
}

/** Licenses every given vehicle under one ACTIVE shop licence, for the "Licensed to rent" badge. */
async function licenseVehicles(merchantId: string, vehicleIds: string[]) {
  const { rows } = await pool.query(
    `insert into shop_licenses (merchant_user_id, licence_number, issuing_authority, issued_at, expires_at, status)
     values ($1, $2, 'ARTO Dehradun', '2024-01-01', '2029-01-01', 'ACTIVE') returning id`,
    [merchantId, `UK14/RAM/2024/${uniq()}`],
  );
  const licenseId = rows[0].id as string;
  for (const vehicleId of vehicleIds) {
    await pool.query(
      `insert into license_vehicles (license_id, vehicle_id, registration_number) values ($1, $2, $3)`,
      [licenseId, vehicleId, reg()],
    );
  }
}

async function main() {
  const models = {
    activa: await findOrCreateModel({ make: "Honda", model: "Activa 6G", fuelType: "PETROL", engineCc: 110, bodyType: "SCOOTER", seats: 2 }),
    jupiter: await findOrCreateModel({ make: "TVS", model: "Jupiter 125", fuelType: "PETROL", engineCc: 125, bodyType: "SCOOTER", seats: 2 }),
    access: await findOrCreateModel({ make: "Suzuki", model: "Access 125", fuelType: "PETROL", engineCc: 125, bodyType: "SCOOTER", seats: 2 }),
    fascino: await findOrCreateModel({ make: "Yamaha", model: "Fascino 125", fuelType: "PETROL", engineCc: 125, bodyType: "SCOOTER", seats: 2 }),
    pulsar: await findOrCreateModel({ make: "Bajaj", model: "Pulsar NS200", fuelType: "PETROL", engineCc: 199, bodyType: "MOTORCYCLE", seats: 2 }),
    classic: await findOrCreateModel({ make: "Royal Enfield", model: "Classic 350", fuelType: "PETROL", engineCc: 349, bodyType: "MOTORCYCLE", seats: 2 }),
    hunter: await findOrCreateModel({ make: "Royal Enfield", model: "Hunter 350", fuelType: "PETROL", engineCc: 349, bodyType: "MOTORCYCLE", seats: 2 }),
    chetak: await findOrCreateModel({ make: "Bajaj", model: "Chetak", fuelType: "ELECTRIC", bodyType: "SCOOTER", seats: 2 }),
    iqube: await findOrCreateModel({ make: "TVS", model: "iQube", fuelType: "ELECTRIC", bodyType: "SCOOTER", seats: 2 }),
    four50x: await findOrCreateModel({ make: "Ather", model: "450X", fuelType: "ELECTRIC", bodyType: "SCOOTER", seats: 2 }),
  };

  const priceBook = {
    scooter: { amount: 40000, weekendAmount: 50000, depositAmount: 150000 },
    scooterPlus: { amount: 55000, weekendAmount: 65000, depositAmount: 200000 },
    motorcycle: { amount: 75000, weekendAmount: 90000, depositAmount: 300000 },
    motorcyclePlus: { amount: 110000, weekendAmount: 130000, depositAmount: 400000 },
    ev: { amount: 60000, weekendAmount: 70000, depositAmount: 250000 },
  };

  // Rishikesh — two shops carrying overlapping models, so the shop-grouping
  // fix and qty-stepper both have something real to show.
  const rishikeshMerchant = await createMerchant("Ganga View Fleet Co.");
  const gangaView = await createShop(rishikeshMerchant, {
    name: "Ganga View Rentals", city: "Rishikesh", lat: 30.1086, lng: 78.2946, rating: 4.7, reviewCount: 184,
  });
  const laxmanJhula = await createShop(rishikeshMerchant, {
    name: "Laxman Jhula Scooters", city: "Rishikesh", lat: 30.1246, lng: 78.3287, rating: 4.3, reviewCount: 96,
  });

  const gangaViewActivas = await createFleet(gangaView, models.activa, 5, priceBook.scooter);
  await createFleet(gangaView, models.jupiter, 2, priceBook.scooter);
  await createFleet(gangaView, models.chetak, 2, priceBook.ev);
  await licenseVehicles(rishikeshMerchant, gangaViewActivas);

  await createFleet(laxmanJhula, models.activa, 3, priceBook.scooter);
  await createFleet(laxmanJhula, models.access, 4, priceBook.scooter);
  await createFleet(laxmanJhula, models.fascino, 1, priceBook.scooter);

  // Haridwar — one shop, bike-heavy.
  const haridwarMerchant = await createMerchant("Har Ki Pauri Rides");
  const harKiPauri = await createShop(haridwarMerchant, {
    name: "Har Ki Pauri Rides", city: "Haridwar", lat: 29.9457, lng: 78.1642, rating: 4.4, reviewCount: 61,
  });
  const harKiPauriPulsars = await createFleet(harKiPauri, models.pulsar, 3, priceBook.motorcycle);
  await createFleet(harKiPauri, models.iqube, 2, priceBook.ev);
  await createFleet(harKiPauri, models.classic, 1, priceBook.motorcyclePlus);
  await licenseVehicles(haridwarMerchant, harKiPauriPulsars);

  // Dehradun — a third shop alongside the two already seeded, same city as
  // the existing Pine & Peak branches, to exercise multi-shop same-city browse.
  const dehradunMerchant = await createMerchant("Clement Town Movers");
  const clementTown = await createShop(dehradunMerchant, {
    name: "Clement Town Movers", city: "Dehradun", lat: 30.2849, lng: 78.0011, rating: 4.1, reviewCount: 38,
  });
  await createFleet(clementTown, models.classic, 3, priceBook.motorcyclePlus);
  await createFleet(clementTown, models.hunter, 2, priceBook.motorcycle);
  await createFleet(clementTown, models.four50x, 3, priceBook.ev);
  await createFleet(clementTown, models.jupiter, 1, priceBook.scooter);

  console.log("Seed complete:");
  console.log("  merchants: Ganga View Fleet Co., Har Ki Pauri Rides, Clement Town Movers");
  console.log("  shops: Ganga View Rentals, Laxman Jhula Scooters, Har Ki Pauri Rides, Clement Town Movers");
  console.log("  Rishikesh now has 5 Activas at one shop and 3 at another — good for testing qty + shop grouping.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
