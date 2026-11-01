// Three known-phone test accounts (admin/merchant/customer) with realistic
// bookings, tickets and deposit states, built by calling the real service
// functions (not hand-rolled SQL for anything money- or status-related) so
// the data matches what the app itself would produce.
// Run after seed.ts: bun src/DB/seed.ts && bun src/DB/seedTestAccounts.ts
import { pool } from "./client.ts";
import { kycClient } from "../providers/kyc.ts";
import { cashfreeClient } from "../providers/cashfree.ts";
import * as ridersService from "../Routes/user/Riders/ridersService.ts";
import { createHold } from "../Routes/user/Bookings/bookingsService.ts";
import { createPaymentIntent, handlePaymentWebhook } from "../Routes/user/Payments/paymentsService.ts";
import { confirmInspection, merchantReturn } from "../Routes/user/Pickup/pickupService.ts";
import * as ticketsService from "../Routes/Tickets/ticketsService.ts";
import { createShop } from "../Routes/merchant/Shops/shopsService.ts";

const ADMIN_PHONE = "+919812340000";
const MERCHANT_PHONE = "+919812340001";
const CUSTOMER_PHONE = "+919812340002";

let eventSeq = 0;
const uniqEventId = () => `seed_${Date.now()}_${(eventSeq += 1)}`;
const reg = () => `UK07SEED${(eventSeq += 1)}`;

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function upsertAdmin() {
  const { rows } = await pool.query(
    `insert into admins (phone, name, role, status) values ($1, 'Test Admin', 'SUPER_ADMIN', 'ACTIVE')
     on conflict (phone) do update set status = 'ACTIVE' returning id`,
    [ADMIN_PHONE],
  );
  return rows[0].id as string;
}

async function upsertMerchant() {
  const { rows } = await pool.query(
    `insert into merchant_users (phone, name) values ($1, 'Test Merchant')
     on conflict (phone) do update set name = excluded.name returning id`,
    [MERCHANT_PHONE],
  );
  return rows[0].id as string;
}

async function upsertCustomer() {
  const { rows } = await pool.query(
    `insert into users (phone, name) values ($1, 'Test Customer')
     on conflict (phone) do update set name = excluded.name returning id`,
    [CUSTOMER_PHONE],
  );
  return rows[0].id as string;
}

async function findOrCreateModel(make: string, model: string) {
  const { rows } = await pool.query(`select id from vehicle_models where make = $1 and model = $2`, [make, model]);
  if (rows[0]) return rows[0].id as string;
  throw new Error(`model ${make} ${model} not found -- run seed.ts first`);
}

async function ensureMerchantShop(merchantId: string) {
  const { rows: existing } = await pool.query(
    `select id from shops where merchant_user_id = $1 and name = 'Test Rentals — Dehradun'`,
    [merchantId],
  );
  if (existing[0]) return existing[0].id as string;

  const shop = await createShop(pool, merchantId, {
    name: "Test Rentals — Dehradun",
    addressLine1: "12 Rajpur Road",
    city: "Dehradun",
    state: "Uttarakhand",
    pincode: "248001",
    latitude: 30.3165,
    longitude: 78.0322,
    gstin: "05AAAAA0000A1Z5",
  });
  return shop.id as string;
}

async function ensureFleet(shopId: string) {
  const { rows: already } = await pool.query(`select id from vehicles where shop_id = $1`, [shopId]);
  if (already.length > 0) return already.map((r) => r.id as string);

  const activa = await findOrCreateModel("Honda", "Activa 6G");
  const classic = await findOrCreateModel("Royal Enfield", "Classic 350");
  const fourFifty = await findOrCreateModel("Ather", "450X");

  const specs = [
    { modelId: activa, amount: 40000, weekendAmount: 50000, deposit: 150000 },
    { modelId: activa, amount: 40000, weekendAmount: 50000, deposit: 150000 },
    { modelId: classic, amount: 110000, weekendAmount: 130000, deposit: 400000 },
    { modelId: fourFifty, amount: 60000, weekendAmount: 70000, deposit: 250000 },
  ];

  const vehicleIds: string[] = [];
  for (const spec of specs) {
    const { rows } = await pool.query(
      `insert into vehicles (shop_id, model_id, registration_number, status, verification_status)
       values ($1, $2, $3, 'ACTIVE', 'VERIFIED') returning id`,
      [shopId, spec.modelId, reg()],
    );
    const vehicleId = rows[0].id as string;
    await pool.query(
      `insert into vehicle_pricing (vehicle_id, amount, weekend_amount, security_deposit_amount, late_fee_amount)
       values ($1, $2, $3, $4, 5000)`,
      [vehicleId, spec.amount, spec.weekendAmount, spec.deposit],
    );
    vehicleIds.push(vehicleId);
  }
  return vehicleIds;
}

async function payAndConfirm(groupId: string, userId: string) {
  const intent = await createPaymentIntent(pool, { groupId, userId }, cashfreeClient);
  await handlePaymentWebhook(
    pool,
    { providerEventId: uniqEventId(), type: "PAYMENT_SUCCESS", orderId: intent.orderId, payload: {} },
    cashfreeClient,
  );
}

async function main() {
  const adminId = await upsertAdmin();
  const merchantId = await upsertMerchant();
  const customerId = await upsertCustomer();

  const shopId = await ensureMerchantShop(merchantId);
  const fleet = await ensureFleet(shopId);
  const [vehicleA, vehicleB, vehicleC, vehicleD] = [fleet[0]!, fleet[1]!, fleet[2]!, fleet[3]!];

  const rider1 = await ridersService.createRider(pool, customerId, { name: "Test Customer", dob: "1995-06-15" });
  await ridersService.verifyLicenceManually(pool, customerId, rider1.id, { licenceNumber: "UK071995000123", dob: "1995-06-15" }, kycClient);
  const rider2 = await ridersService.createRider(pool, customerId, { name: "Second Rider", dob: "1998-03-02" });

  // A: upcoming, unpaid HOLD -- tests Pay now / cancel.
  await createHold(pool, {
    userId: customerId,
    items: [{ vehicleId: vehicleA, riderId: rider1.id }],
    pickupAt: daysFromNow(2),
    returnAt: daysFromNow(4),
  });

  // B: upcoming, paid and CONFIRMED, not yet picked up -- tests Confirm pickup.
  const heldB = await createHold(pool, {
    userId: customerId,
    items: [{ vehicleId: vehicleB, riderId: rider1.id }],
    pickupAt: daysFromNow(6),
    returnAt: daysFromNow(8),
  });
  await payAndConfirm(heldB.groupId, customerId);

  // C: past, picked up and cleanly returned -- tests Leave a review + deposit released.
  const heldC = await createHold(pool, {
    userId: customerId,
    items: [{ vehicleId: vehicleC, riderId: rider1.id }],
    pickupAt: daysFromNow(-5),
    returnAt: daysFromNow(-3),
  });
  await payAndConfirm(heldC.groupId, customerId);
  await confirmInspection(pool, { userId: customerId, bookingId: heldC.bookings[0]!.id, storageKey: "seed/inspection-c" });
  await merchantReturn(
    pool,
    { merchantUserId: merchantId, bookingId: heldC.bookings[0]!.id, claim: false },
    cashfreeClient,
    (args) => ticketsService.openTicket(pool, args),
  );

  // D: past, picked up and returned with a deposit claim -- tests the claim banner + its auto-opened ticket.
  // rider2 is left unverified on purpose, for testing the verify flow -- reuse
  // rider1 here since its booking windows (A/B/C) don't overlap this one.
  const heldD = await createHold(pool, {
    userId: customerId,
    items: [{ vehicleId: vehicleD, riderId: rider1.id }],
    pickupAt: daysFromNow(-10),
    returnAt: daysFromNow(-8),
  });
  await payAndConfirm(heldD.groupId, customerId);
  await confirmInspection(pool, { userId: customerId, bookingId: heldD.bookings[0]!.id, storageKey: "seed/inspection-d" });
  await merchantReturn(
    pool,
    {
      merchantUserId: merchantId,
      bookingId: heldD.bookings[0]!.id,
      claim: true,
      reason: "Scratch on the left body panel, repair quoted at ₹1,800.",
      amount: 180000,
    },
    cashfreeClient,
    (args) => ticketsService.openTicket(pool, args),
  );

  // A standalone, already-answered support ticket not tied to any booking.
  const helpTicket = await ticketsService.openTicket(pool, {
    openedByType: "CUSTOMER",
    openedById: customerId,
    subject: "App crashes on search",
    firstMessage: "The app crashes whenever I search for scooters in Rishikesh.",
  });
  await ticketsService.setTicketCategory(pool, helpTicket.id, { partyType: "CUSTOMER", partyId: customerId }, { category: "APP_HELP" });
  if (helpTicket.assignedTo) {
    await ticketsService.postMessage(
      pool,
      helpTicket.id,
      { partyType: "ADMIN", partyId: helpTicket.assignedTo },
      "Thanks for flagging — we've shipped a fix, can you update the app and try again?",
    );
  }

  console.log("Seeded 3 test accounts:");
  console.log(`  admin:    ${ADMIN_PHONE}  (SUPER_ADMIN)`);
  console.log(`  merchant: ${MERCHANT_PHONE}  (owns "Test Rentals — Dehradun", 4 vehicles)`);
  console.log(`  customer: ${CUSTOMER_PHONE}  (2 riders, 4 bookings: HOLD / CONFIRMED / COMPLETED+review-eligible / COMPLETED+deposit-claim, plus 1 answered support ticket)`);
  console.log("All OTPs log to the console in dev (no SMS provider configured) — check the backend terminal after sending.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
