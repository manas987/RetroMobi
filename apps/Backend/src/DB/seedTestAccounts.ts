// Known-phone test accounts for every portal and role, with data that
// exercises every feature: bookings in each state, coupons of every kind
// (platform- and shop-funded, rule-based, paused, expired), shop wallets with
// credits, withdrawals in each state, admin payouts and adjustments, a payout
// account, a deposit claim and support tickets.
//
// Money- and status-bearing rows go through the real service functions, so
// they match what the app itself produces. Two things are not reachable through
// services and are set by hand: verified riders (they need a real licence
// check) and bookings in the past (createHold refuses a pickup that has passed),
// which are booked in the future and then moved back in time.
//
//   bun src/DB/seed.ts            # optional: extra shops to browse
//   bun src/DB/seedTestAccounts.ts
//
// Re-running is safe: once the accounts exist it only prints the logins.
import { pool } from "./client.ts";
import { cashfreeClient } from "../providers/cashfree.ts";
import { createHold, cancelBooking } from "../Routes/user/Bookings/bookingsService.ts";
import { createPaymentIntent, handlePaymentWebhook } from "../Routes/user/Payments/paymentsService.ts";
import { confirmInspection, merchantReturn } from "../Routes/user/Pickup/pickupService.ts";
import * as ticketsService from "../Routes/Tickets/ticketsService.ts";
import { createShop } from "../Routes/merchant/Shops/shopsService.ts";
import { createCoupon, setCouponStatus } from "../Routes/admin/Coupons/couponsService.ts";
import { adjustWallet, payShopDirectly, payWithdrawal, rejectWithdrawal, requestWithdrawal } from "../lib/wallet.ts";
import { createRider, passIdentityCheck } from "../test/fixtures.ts";

// This script fabricates paid bookings, so it needs the payment provider's
// local escape hatch (providers/cashfree.ts refuses to fake a paid order
// otherwise). assertConfig refuses this flag in production anyway.
process.env.PAYMENTS_DEV_AUTO_SUCCEED ??= "true";
// Pickup photos here are fake keys. With real R2 credentials in .env the
// inspection would look for an object that was never uploaded, so storage is
// forced onto its dev-fallback for this process only.
process.env.R2_ACCOUNT_ID = "";

const PHONES = {
  superAdmin: "+919812340000",
  admin: "+919812340003",
  support: "+919812340004",
  owner: "+919812340001",
  manager: "+919812340005",
  staff: "+919812340006",
  owner2: "+919812340007",
  customer: "+919812340002",
  newCustomer: "+919812340008",
  youngRider: "+919812340009",
} as const;

let seq = 0;
const eventId = () => `seed_${Date.now()}_${(seq += 1)}`;
const reg = (prefix: string) => `${prefix}SEED${Date.now().toString(36).toUpperCase().slice(-4)}${(seq += 1)}`;
const DAY = 86_400_000;
/** 09:00 IST, `days` from today. */
function at(days: number) {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(3, 30, 0, 0);
  return d;
}

async function upsert(table: "admins" | "merchant_users" | "users", phone: string, name: string, extra: Record<string, string> = {}) {
  const cols = ["phone", "name", ...Object.keys(extra)];
  const vals = [phone, name, ...Object.values(extra)];
  const { rows } = await pool.query(
    `insert into ${table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})
     on conflict (phone) do update set name = excluded.name returning id`,
    vals,
  );
  return rows[0].id as string;
}

async function model(make: string, name: string, cls: "SCOOTER" | "MOTORCYCLE", fuel: "PETROL" | "ELECTRIC", cc: number | null) {
  const { rows } = await pool.query(`select id from vehicle_models where make = $1 and model = $2`, [make, name]);
  if (rows[0]) return rows[0].id as string;
  const created = await pool.query(
    `insert into vehicle_models (make, model, class, fuel_type, engine_cc, body_type, seating_capacity)
     values ($1, $2, $3, $4, $5, $3, 2) returning id`,
    [make, name, cls, fuel, cc],
  );
  return created.rows[0].id as string;
}

async function shop(merchantId: string, opts: { name: string; city: string; address: string; lat: number; lng: number }) {
  const created = await createShop(pool, merchantId, {
    name: opts.name,
    addressLine1: opts.address,
    city: opts.city,
    state: "Uttarakhand",
    pincode: "248001",
    latitude: opts.lat,
    longitude: opts.lng,
    gstin: "05AAAAA0000A1Z5",
  });
  await pool.query(`update shops set verification_status = 'VERIFIED' where id = $1`, [created.id]);
  return created.id as string;
}

/** ACTIVE, verified, priced and named on an ACTIVE transport licence: bookable. */
async function fleet(
  merchantId: string,
  shopId: string,
  specs: Array<{ modelId: string; amount: number; weekend: number; deposit: number }>,
) {
  const { rows: lic } = await pool.query(
    `insert into shop_licenses (merchant_user_id, licence_number, issuing_authority, issued_at, expires_at, status)
     values ($1, $2, 'ARTO Dehradun', '2024-01-01', current_date + interval '5 years', 'ACTIVE') returning id`,
    [merchantId, `UK14/RNT/2024/${(seq += 1)}${Date.now().toString(36).slice(-4)}`],
  );
  const ids: string[] = [];
  for (const spec of specs) {
    const registration = reg("UK07");
    const { rows } = await pool.query(
      `insert into vehicles (shop_id, model_id, registration_number, status, verification_status)
       values ($1, $2, $3, 'ACTIVE', 'VERIFIED') returning id`,
      [shopId, spec.modelId, registration],
    );
    const vehicleId = rows[0].id as string;
    await pool.query(
      `insert into vehicle_pricing (vehicle_id, amount, weekend_amount, security_deposit_amount, late_fee_amount)
       values ($1, $2, $3, $4, 5000)`,
      [vehicleId, spec.amount, spec.weekend, spec.deposit],
    );
    await pool.query(
      `insert into license_vehicles (license_id, vehicle_id, registration_number) values ($1, $2, $3)`,
      [lic[0].id, vehicleId, registration],
    );
    ids.push(vehicleId);
  }
  return ids;
}

async function pay(groupId: string, userId: string) {
  const intent = await createPaymentIntent(pool, { groupId, userId }, cashfreeClient);
  await handlePaymentWebhook(
    pool,
    { providerEventId: eventId(), type: "PAYMENT_SUCCESS", orderId: intent.orderId, payload: {} },
    cashfreeClient,
  );
}

/** Books in the future (the only way the service allows), pays, then moves the rental back in time. */
async function pastRental(input: {
  userId: string;
  riderId: string;
  vehicleId: string;
  merchantId: string;
  startDaysAgo: number;
  nights: number;
  couponCode?: string;
  claim?: { reason: string; amount: number };
}) {
  // Far enough ahead to collide with nothing else the seed books.
  const futureStart = at(200 + (seq += 3));
  const held = await createHold(pool, {
    userId: input.userId,
    items: [{ vehicleId: input.vehicleId, riderId: input.riderId }],
    pickupAt: futureStart,
    returnAt: new Date(futureStart.getTime() + input.nights * DAY),
    couponCode: input.couponCode,
  });
  await pay(held.groupId, input.userId);
  const bookingId = held.bookings[0]!.id;
  const pickup = at(-input.startDaysAgo);
  const ret = new Date(pickup.getTime() + input.nights * DAY);
  await pool.query(
    `update bookings set scheduled_pickup_at = $2, scheduled_return_at = $3, created_at = $2::timestamptz - interval '3 days' where id = $1`,
    [bookingId, pickup, ret],
  );
  await passIdentityCheck(pool, bookingId);
  await confirmInspection(pool, { userId: input.userId, bookingId, storageKey: `seed/inspection-${bookingId}` });
  await merchantReturn(
    pool,
    {
      merchantUserId: input.merchantId,
      bookingId,
      claim: !!input.claim,
      reason: input.claim?.reason,
      amount: input.claim?.amount,
    },
    cashfreeClient,
    (args) => ticketsService.openTicket(pool, args),
  );
  await pool.query(`update bookings set actual_pickup_at = $2, actual_return_at = $3 where id = $1`, [bookingId, pickup, ret]);
  return bookingId;
}

function printLogins() {
  const rows: Array<[string, string, string, string]> = [
    ["Admin", "SUPER_ADMIN", PHONES.superAdmin, "Everything: money, coupons, withdrawals, shop wallets, audit"],
    ["Admin", "ADMIN", PHONES.admin, "Reviews, merchants, booking ops (no money pages)"],
    ["Admin", "SUPPORT", PHONES.support, "Support tickets only"],
    ["Merchant", "OWNER", PHONES.owner, "Test Rentals: Dehradun + Rishikesh shops, wallet, coupons, payout account"],
    ["Merchant", "MANAGER", PHONES.manager, "Dehradun shop as manager (no money)"],
    ["Merchant", "STAFF", PHONES.staff, "Dehradun shop as counter staff"],
    ["Merchant", "OWNER", PHONES.owner2, "Hill Riders: Mussoorie, second wallet"],
    ["Customer", "", PHONES.customer, "6 bookings in every state, coupons used, a ticket"],
    ["Customer", "", PHONES.newCustomer, "Verified rider, no bookings: WELCOME20 applies"],
    ["Customer", "", PHONES.youngRider, "Rider aged 22 with a birthday in 3 days: BDAY25, YOUTH15"],
  ];
  console.log("\nLogins (phone OTP; with WhatsApp unset the code is printed in the backend log as [dev-fallback]):");
  for (const [portal, role, phone, what] of rows) {
    console.log(`  ${portal.padEnd(9)} ${role.padEnd(12)} ${phone}  ${what}`);
  }
  console.log("\nPortals: customer /login · merchant /merchant/login · admin /admin/login");
  console.log("Coupons: WELCOME20 FLAT150 RIDER5 BDAY25 WEEKEND10 YOUTH15 (platform) · DEHRADUN50 LONGRIDE (shop) · OLD10 (expired) · SUMMER5 (paused)");
}

async function main() {
  const { rows: done } = await pool.query(
    `select 1 from shops s join merchant_users m on m.id = s.merchant_user_id
      where m.phone = $1 and s.name = 'Test Rentals — Dehradun'`,
    [PHONES.owner],
  );
  if (done.length > 0) {
    console.log("Test accounts already seeded; nothing changed.");
    printLogins();
    return;
  }

  // ---- People ----------------------------------------------------------------
  const superAdminId = await upsert("admins", PHONES.superAdmin, "Test Super Admin", { role: "SUPER_ADMIN", status: "ACTIVE" });
  await upsert("admins", PHONES.admin, "Test Admin", { role: "ADMIN", status: "ACTIVE" });
  await upsert("admins", PHONES.support, "Test Support", { role: "SUPPORT", status: "ACTIVE" });

  const ownerId = await upsert("merchant_users", PHONES.owner, "Test Merchant");
  const managerId = await upsert("merchant_users", PHONES.manager, "Test Manager");
  const staffId = await upsert("merchant_users", PHONES.staff, "Test Staff");
  const owner2Id = await upsert("merchant_users", PHONES.owner2, "Hill Riders Owner");

  const customerId = await upsert("users", PHONES.customer, "Test Customer");
  const newCustomerId = await upsert("users", PHONES.newCustomer, "New Customer");
  const youngId = await upsert("users", PHONES.youngRider, "Young Rider");

  // ---- Shops and fleets ------------------------------------------------------------
  const activa = await model("Honda", "Activa 6G", "SCOOTER", "PETROL", 110);
  const jupiter = await model("TVS", "Jupiter", "SCOOTER", "PETROL", 110);
  const ather = await model("Ather", "450X", "SCOOTER", "ELECTRIC", null);
  const classic = await model("Royal Enfield", "Classic 350", "MOTORCYCLE", "PETROL", 349);

  const dehradun = await shop(ownerId, { name: "Test Rentals — Dehradun", city: "Dehradun", address: "12 Rajpur Road", lat: 30.3165, lng: 78.0322 });
  const rishikesh = await shop(ownerId, { name: "Test Rentals — Rishikesh", city: "Rishikesh", address: "4 Laxman Jhula Road", lat: 30.1158, lng: 78.3221 });
  const mussoorie = await shop(owner2Id, { name: "Hill Riders — Mussoorie", city: "Mussoorie", address: "22 Mall Road", lat: 30.4598, lng: 78.0644 });

  for (const [memberId, role] of [[managerId, "MANAGER"], [staffId, "STAFF"]] as const) {
    await pool.query(
      `insert into shop_members (shop_id, merchant_user_id, role, status) values ($1, $2, $3, 'ACTIVE')`,
      [dehradun, memberId, role],
    );
  }

  const [d1, d2, d3, d4, d5] = await fleet(ownerId, dehradun, [
    { modelId: activa, amount: 40_000, weekend: 50_000, deposit: 150_000 },
    { modelId: activa, amount: 40_000, weekend: 50_000, deposit: 150_000 },
    { modelId: jupiter, amount: 38_000, weekend: 45_000, deposit: 150_000 },
    { modelId: classic, amount: 110_000, weekend: 130_000, deposit: 400_000 },
    { modelId: ather, amount: 60_000, weekend: 70_000, deposit: 250_000 },
  ]);
  const [r1, r2] = await fleet(ownerId, rishikesh, [
    { modelId: activa, amount: 45_000, weekend: 55_000, deposit: 150_000 },
    { modelId: classic, amount: 120_000, weekend: 140_000, deposit: 400_000 },
  ]);
  const [m1, m2] = await fleet(owner2Id, mussoorie, [
    { modelId: jupiter, amount: 42_000, weekend: 52_000, deposit: 150_000 },
    { modelId: ather, amount: 65_000, weekend: 75_000, deposit: 250_000 },
  ]);

  // The Dehradun owner has a verified Cashfree beneficiary, so an admin can pay
  // their withdrawals through Cashfree as well as offline.
  await pool.query(
    `insert into merchant_payout_accounts
       (merchant_user_id, provider, provider_account_ref, beneficiary_id, holder_name, account_last4, ifsc, status, provider_status, verified_at)
     values ($1, 'CASHFREE', $2, $2, 'Test Merchant', '4321', 'HDFC0001234', 'VERIFIED', 'VERIFIED', now())`,
    [ownerId, `merch_${ownerId.replace(/-/g, "")}`],
  );

  // ---- Riders --------------------------------------------------------------------------
  const year = new Date().getUTCFullYear();
  const soon = new Date(Date.now() + 3 * DAY);
  const birthdaySoon = `${year - 22}-${String(soon.getUTCMonth() + 1).padStart(2, "0")}-${String(soon.getUTCDate()).padStart(2, "0")}`;
  const rider1 = await createRider(pool, customerId, { dob: "1995-06-15" });
  await createRider(pool, customerId, { dob: "1998-03-02", verified: false }); // left unverified: try the verify flow
  const rider3 = await createRider(pool, customerId, { dob: "1990-11-20" });
  await createRider(pool, newCustomerId, { dob: "1993-08-08" });
  const youngRider = await createRider(pool, youngId, { dob: birthdaySoon });
  await pool.query(`update riders set name = 'Test Customer' where id = $1`, [rider1.id]);
  await pool.query(`update riders set name = 'Second Rider' where user_id = $1 and id not in ($2, $3)`, [customerId, rider1.id, rider3.id]);
  await pool.query(`update riders set name = 'Third Rider' where id = $1`, [rider3.id]);
  await pool.query(`update riders set name = 'New Customer' where user_id = $1`, [newCustomerId]);
  await pool.query(`update riders set name = 'Young Rider' where id = $1`, [youngRider.id]);

  // ---- Coupons ---------------------------------------------------------------------------
  const admin = { type: "ADMIN" as const, id: superAdminId };
  const merchant = { type: "MERCHANT" as const, id: ownerId };
  const from = new Date(Date.now() - DAY);
  const until = new Date(Date.now() + 120 * DAY);
  await createCoupon(pool, admin, { code: "WELCOME20", description: "20% off your first ride, up to ₹200", type: "PERCENT", value: 20, maxDiscount: 20_000, perUserLimit: 1, conditions: { firstBookingOnly: true }, validFrom: from, validUntil: until });
  await createCoupon(pool, admin, { code: "FLAT150", description: "₹150 off rentals of ₹800 or more", type: "FLAT", value: 15_000, minOrderAmount: 80_000, perUserLimit: 3, validFrom: from, validUntil: until });
  await createCoupon(pool, admin, { code: "RIDER5", description: "10% off once you've completed 5 rides", type: "PERCENT", value: 10, conditions: { minCompletedRentals: 5 }, validFrom: from, validUntil: until });
  await createCoupon(pool, admin, { code: "BDAY25", description: "Birthday week: 25% off, up to ₹300", type: "PERCENT", value: 25, maxDiscount: 30_000, perUserLimit: 1, conditions: { birthdayWindowDays: 7 }, validFrom: from, validUntil: until });
  await createCoupon(pool, admin, { code: "WEEKEND10", description: "10% off weekend pickups of 2+ days", type: "PERCENT", value: 10, conditions: { pickupWeekdays: [0, 6], minRentalDays: 2 }, validFrom: from, validUntil: until });
  await createCoupon(pool, admin, { code: "YOUTH15", description: "15% off for riders aged 18–25", type: "PERCENT", value: 15, maxDiscount: 25_000, conditions: { minRiderAge: 18, maxRiderAge: 25 }, validFrom: from, validUntil: until });
  await createCoupon(pool, admin, { code: "OLD10", description: "Expired launch offer", type: "PERCENT", value: 10, validFrom: new Date(Date.now() - 60 * DAY), validUntil: new Date(Date.now() - 30 * DAY) });
  const paused = await createCoupon(pool, admin, { code: "SUMMER5", description: "Paused summer offer", type: "PERCENT", value: 5, validFrom: from, validUntil: until });
  await setCouponStatus(pool, superAdminId, paused.id, "PAUSED");
  await createCoupon(pool, merchant, { code: "DEHRADUN50", description: "₹50 off at Test Rentals Dehradun", type: "FLAT", value: 5_000, perUserLimit: 2, fundedBy: "SHOP", shopIds: [dehradun], validFrom: from, validUntil: until });
  await createCoupon(pool, merchant, { code: "LONGRIDE", description: "12% off rentals of 3+ days in Rishikesh", type: "PERCENT", value: 12, conditions: { minRentalDays: 3 }, fundedBy: "SHOP", shopIds: [rishikesh], validFrom: from, validUntil: until });

  // ---- Bookings: main customer ---------------------------------------------------
  // A: unpaid HOLD -- Pay now / cancel.
  await createHold(pool, { userId: customerId, items: [{ vehicleId: d1!, riderId: rider1.id }], pickupAt: at(2), returnAt: at(4) });
  // B: CONFIRMED, platform coupon, two scooters in one checkout -- Confirm pickup, FLAT150 split.
  const heldB = await createHold(pool, {
    userId: customerId,
    items: [{ vehicleId: d2!, riderId: rider1.id }, { vehicleId: d3!, riderId: rider3.id }],
    pickupAt: at(6),
    returnAt: at(9),
    couponCode: "FLAT150",
  });
  await pay(heldB.groupId, customerId);
  // C: COMPLETED, shop-funded coupon -- review + deposit released + shop paid the discount.
  await pastRental({ userId: customerId, riderId: rider1.id, vehicleId: d4!, merchantId: ownerId, startDaysAgo: 6, nights: 2, couponCode: "DEHRADUN50" });
  // D: COMPLETED with a deposit claim -- claim banner + its auto-opened ticket.
  await pastRental({
    userId: customerId,
    riderId: rider1.id,
    vehicleId: d5!,
    merchantId: ownerId,
    startDaysAgo: 12,
    nights: 2,
    claim: { reason: "Scratch on the left body panel, repair quoted at ₹1,800.", amount: 180_000 },
  });
  // E: CONFIRMED at Rishikesh with the shop's long-ride coupon.
  const heldE = await createHold(pool, {
    userId: customerId,
    items: [{ vehicleId: r1!, riderId: rider3.id }],
    pickupAt: at(14),
    returnAt: at(18),
    couponCode: "LONGRIDE",
  });
  await pay(heldE.groupId, customerId);
  // F: paid, then cancelled more than 24h out -- refund + the shop keeps the penalty.
  const heldF = await createHold(pool, { userId: customerId, items: [{ vehicleId: r2!, riderId: rider1.id }], pickupAt: at(20), returnAt: at(22) });
  await pay(heldF.groupId, customerId);
  await cancelBooking(pool, { userId: customerId, bookingId: heldF.bookings[0]!.id }, cashfreeClient);

  // ---- Bookings: young rider at Mussoorie ---------------------------------------
  await pastRental({ userId: youngId, riderId: youngRider.id, vehicleId: m1!, merchantId: owner2Id, startDaysAgo: 20, nights: 3 });
  const heldY = await createHold(pool, { userId: youngId, items: [{ vehicleId: m2!, riderId: youngRider.id }], pickupAt: at(3), returnAt: at(5), couponCode: "YOUTH15" });
  await pay(heldY.groupId, youngId);

  // ---- Wallets ---------------------------------------------------------------------------
  // Real credits from the bookings above are small, so an opening balance makes
  // withdrawals possible to try.
  await adjustWallet(pool, { shopId: dehradun, adminId: superAdminId, amount: 600_000, reason: "Opening balance carried over from before the wallet" });
  await adjustWallet(pool, { shopId: mussoorie, adminId: superAdminId, amount: 250_000, reason: "Opening balance carried over from before the wallet" });
  await adjustWallet(pool, { shopId: dehradun, adminId: superAdminId, amount: -20_000, reason: "Helmet replaced for a customer, recovered from the shop" });

  const paid = await requestWithdrawal(pool, { shopId: dehradun, requestedBy: ownerId, amount: 150_000, payTo: "testrentals@okhdfcbank" });
  await payWithdrawal(pool, { withdrawalId: paid.id, adminId: superAdminId, method: "UPI", reference: "UPI-431298765012", note: "Paid from the ops account" });
  const rejected = await requestWithdrawal(pool, { shopId: dehradun, requestedBy: ownerId, amount: 70_000, payTo: "wrong@upi" });
  await rejectWithdrawal(pool, { withdrawalId: rejected.id, adminId: superAdminId, reason: "That UPI ID isn't registered to the shop. Please request again with the right one." });
  await requestWithdrawal(pool, { shopId: dehradun, requestedBy: ownerId, amount: 100_000, payTo: "testrentals@okhdfcbank" }); // waiting for an admin
  await requestWithdrawal(pool, { shopId: mussoorie, requestedBy: owner2Id, amount: 60_000, payTo: "Bank: HILL RIDERS, A/C 99887766, SBIN0001234" });
  await payShopDirectly(pool, { shopId: mussoorie, adminId: superAdminId, amount: 100_000, method: "CASH", reference: "RCPT-0007", note: "Handed over at the Mussoorie office" });

  // ---- Support --------------------------------------------------------------------------
  const help = await ticketsService.openTicket(pool, {
    openedByType: "CUSTOMER",
    openedById: customerId,
    subject: "App crashes on search",
    firstMessage: "The app crashes whenever I search for scooters in Rishikesh.",
  });
  await ticketsService.setTicketCategory(pool, help.id, { partyType: "CUSTOMER", partyId: customerId }, { category: "APP_HELP" });
  if (help.assignedTo) {
    await ticketsService.postMessage(pool, help.id, { partyType: "ADMIN", partyId: help.assignedTo }, "Thanks for flagging. We've shipped a fix; can you update and try again?");
  }
  await ticketsService.openTicket(pool, {
    openedByType: "MERCHANT",
    openedById: ownerId,
    subject: "When will my withdrawal arrive?",
    firstMessage: "I requested ₹1,000 yesterday. How long does it usually take?",
  });

  // The bookings above queued real notifications to these made-up phone numbers
  // and emails. They are someone's numbers, so they must never go out, even
  // when a later run has real WhatsApp/Resend credentials: closed as FAILED
  // with the reason, which the sweep never retries.
  await pool.query(
    `update notifications set status = 'FAILED', error = 'seed data: not sent'
      where status = 'PENDING' and recipient_id = any($1::uuid[])`,
    [[customerId, newCustomerId, youngId, ownerId, managerId, staffId, owner2Id, superAdminId]],
  );

  console.log("Seeded: 3 shops, 9 vehicles, 10 coupons, bookings in every state, 2 wallets with withdrawals.");
  printLogins();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
