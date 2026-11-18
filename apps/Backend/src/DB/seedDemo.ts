// Local demo world for the test merchant (+919812340001): every kind of shop,
// vehicle, paper and booking the app knows about, so each screen has something
// real to show. Run after migrations: bun src/DB/seedDemo.ts
//
// Each run WIPES the test merchant's shops, vehicles, bookings, papers and
// activity, then rebuilds them. Other merchants, customers and admins are left
// alone. Local databases only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./client.ts";
import { istDate } from "../lib/licenceGate.ts";
import { composeTotal, priceRental } from "../lib/pricing.ts";
import { createRider } from "../test/fixtures.ts";

const MERCHANT_PHONE = "+919812340001";
const CUSTOMER_PHONE = "+919812340002";
const STAFF_PHONE = "+919800054321";
const MANAGER_PHONE = "+919800054322";
const INVITE_PHONE = "+919800054399";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const MODELS = {
  activa: ["Honda", "Activa 6G", "PETROL", 110, "SCOOTER", 45000],
  jupiter: ["TVS", "Jupiter 125", "PETROL", 125, "SCOOTER", 52000],
  access: ["Suzuki", "Access 125", "PETROL", 125, "SCOOTER", 55000],
  fascino: ["Yamaha", "Fascino 125", "PETROL", 125, "SCOOTER", 50000],
  ather: ["Ather", "450X", "ELECTRIC", null, "SCOOTER", 66000],
  iqube: ["TVS", "iQube", "ELECTRIC", null, "SCOOTER", 62000],
  chetak: ["Bajaj", "Chetak", "ELECTRIC", null, "SCOOTER", 64000],
  classic: ["Royal Enfield", "Classic 350", "PETROL", 349, "MOTORCYCLE", 100000],
  hunter: ["Royal Enfield", "Hunter 350", "PETROL", 349, "MOTORCYCLE", 89000],
  himalayan: ["Royal Enfield", "Himalayan 450", "PETROL", 452, "MOTORCYCLE", 125000],
  pulsar: ["Bajaj", "Pulsar NS200", "PETROL", 199, "MOTORCYCLE", 72000],
  bobber: ["Jawa", "42 Bobber", "PETROL", 334, "MOTORCYCLE", 108000],
} as const;
type ModelKey = keyof typeof MODELS;
const COLORS = ["Pearl White", "Matte Black", "Racing Red", "Ocean Blue", "Grey", "Olive Green"];

/**
 * How a vehicle looks on the merchant's screens:
 * - SHOWING: live for customers. PAUSED: approved, switched off by the merchant.
 * - CHECKING: sent to RetroMobi. NEEDS_INFO: just added, no price/photos/papers.
 * - REJECTED: RetroMobi sent it back. DOC_REJECTED: one paper sent back.
 * - EXPIRED_DOC: approved, but its PUC (or insurance for an EV) ran out.
 * - BLOCKED: live, but blocked for servicing. FESTIVAL: live with a special price.
 * - WAITING: approved, waiting on the shop's own approval.
 */
type VehicleState = "SHOWING" | "PAUSED" | "CHECKING" | "NEEDS_INFO" | "REJECTED" | "DOC_REJECTED" | "EXPIRED_DOC" | "BLOCKED" | "FESTIVAL" | "WAITING";
type PaperState = "VERIFIED" | "PENDING" | "REJECTED" | "EXPIRED";

interface ShopSpec {
  key: string;
  area: string;
  city: string;
  pincode: string;
  lat: number;
  lng: number;
  landmark?: string;
  type: "MAIN" | "BRANCH";
  verify: "VERIFIED" | "PENDING" | "UNVERIFIED" | "REJECTED";
  rejectNote?: string;
  closed?: boolean;
  hours?: boolean;
  licence?: "A" | "B" | "C";
  papers: Partial<Record<"SHOP_ACT" | "PREMISES" | "LANDLORD_NOC", PaperState>>;
  paperNotes?: Partial<Record<"SHOP_ACT" | "PREMISES" | "LANDLORD_NOC", string>>;
  photos?: number;
  vehicles: Array<[ModelKey, VehicleState]>;
}

const SHOPS: ShopSpec[] = [
  {
    key: "rajpur", area: "Rajpur Road", city: "Dehradun", pincode: "248001", lat: 30.3332, lng: 78.0559, type: "MAIN",
    landmark: "Opposite Pacific Mall, next to the HP petrol pump", verify: "VERIFIED", licence: "A", photos: 3,
    papers: { SHOP_ACT: "VERIFIED", PREMISES: "VERIFIED", LANDLORD_NOC: "VERIFIED" },
    vehicles: [["activa", "SHOWING"], ["jupiter", "SHOWING"], ["classic", "SHOWING"], ["ather", "SHOWING"], ["himalayan", "SHOWING"],
      ["access", "SHOWING"], ["pulsar", "SHOWING"], ["fascino", "SHOWING"], ["hunter", "FESTIVAL"], ["iqube", "BLOCKED"],
      ["bobber", "PAUSED"], ["jupiter", "EXPIRED_DOC"]],
  },
  {
    key: "clocktower", area: "Clock Tower", city: "Dehradun", pincode: "248001", lat: 30.3255, lng: 78.0420, type: "BRANCH",
    landmark: "Behind Paltan Bazaar gate", verify: "VERIFIED", licence: "A", photos: 1,
    papers: { SHOP_ACT: "VERIFIED", PREMISES: "VERIFIED" },
    vehicles: [["activa", "SHOWING"], ["chetak", "SHOWING"], ["hunter", "SHOWING"], ["access", "SHOWING"], ["fascino", "SHOWING"], ["classic", "CHECKING"]],
  },
  {
    key: "tapovan", area: "Tapovan", city: "Rishikesh", pincode: "249192", lat: 30.1318, lng: 78.3238, type: "BRANCH",
    landmark: "Near Laxman Jhula taxi stand", verify: "VERIFIED", licence: "B",
    papers: { SHOP_ACT: "VERIFIED", PREMISES: "VERIFIED", LANDLORD_NOC: "VERIFIED" },
    vehicles: [["himalayan", "SHOWING"], ["classic", "SHOWING"], ["activa", "SHOWING"], ["ather", "SHOWING"], ["pulsar", "SHOWING"],
      ["jupiter", "EXPIRED_DOC"], ["hunter", "REJECTED"], ["access", "DOC_REJECTED"]],
  },
  {
    key: "triveni", area: "Triveni Ghat", city: "Rishikesh", pincode: "249201", lat: 30.1026, lng: 78.2941, type: "BRANCH",
    verify: "UNVERIFIED", papers: { SHOP_ACT: "PENDING" },
    vehicles: [["activa", "NEEDS_INFO"], ["iqube", "NEEDS_INFO"], ["classic", "CHECKING"]],
  },
  {
    key: "harkipauri", area: "Har Ki Pauri", city: "Haridwar", pincode: "249401", lat: 29.9560, lng: 78.1734, type: "BRANCH",
    landmark: "Lane beside Gau Ghat, first left", verify: "PENDING", licence: "C",
    papers: { SHOP_ACT: "PENDING", PREMISES: "PENDING" },
    vehicles: [["activa", "CHECKING"], ["jupiter", "CHECKING"], ["access", "CHECKING"], ["chetak", "CHECKING"], ["pulsar", "CHECKING"]],
  },
  {
    key: "jwalapur", area: "Jwalapur", city: "Haridwar", pincode: "249407", lat: 29.9197, lng: 78.1119, type: "BRANCH",
    verify: "REJECTED", rejectNote: "The rent agreement is for a different address. Upload the one for this Jwalapur shop and send it again.",
    licence: "C", papers: { SHOP_ACT: "VERIFIED", PREMISES: "REJECTED" },
    paperNotes: { PREMISES: "This agreement names a shop in Roorkee, not Jwalapur." },
    vehicles: [["activa", "WAITING"], ["fascino", "WAITING"], ["access", "WAITING"], ["iqube", "WAITING"], ["pulsar", "WAITING"]],
  },
  {
    key: "mussoorie", area: "Mall Road", city: "Mussoorie", pincode: "248179", lat: 30.4598, lng: 78.0664, type: "BRANCH",
    landmark: "Next to the Library Chowk ropeway", verify: "VERIFIED", closed: true, licence: "A",
    papers: { SHOP_ACT: "VERIFIED", PREMISES: "VERIFIED" },
    vehicles: [["himalayan", "SHOWING"], ["classic", "SHOWING"], ["activa", "SHOWING"], ["jupiter", "PAUSED"]],
  },
  {
    // Just added: no hours, no papers, no vehicles. The setup guide starts from zero here.
    key: "premnagar", area: "Prem Nagar", city: "Dehradun", pincode: "248007", lat: 30.3326, lng: 77.9640, type: "BRANCH",
    verify: "UNVERIFIED", hours: false, papers: {}, vehicles: [],
  },
];

const RIDER_NAMES = ["Aarav Sharma", "Priya Negi", "Rohan Mehta", "Ananya Rawat", "Vikram Singh", "Sneha Bisht", "Kabir Kapoor",
  "Isha Joshi", "Arjun Thapa", "Meera Iyer", "Dev Malhotra", "Tara Gusain", "Nikhil Verma", "Pooja Chauhan", "Rahul Bhatt"];
const LEGACY_RIDER_NAMES = ["Demo Rider", "Demo Pickup Rider"];

const key = (prefix: string) => `${prefix}/${randomUUID()}`;
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** Everything the test merchant owns, in an order the foreign keys accept. */
async function wipe(client: PoolClient, merchantId: string) {
  const { rows: [ids] } = await client.query(
    `select array(select id from shops where merchant_user_id = $1) as shops,
            array(select v.id from vehicles v join shops s on s.id = v.shop_id where s.merchant_user_id = $1) as vehicles`,
    [merchantId],
  );
  const { rows: [b] } = await client.query(
    `select array(select id from bookings where vehicle_id = any($1)) as bookings,
            array(select distinct group_id from bookings where vehicle_id = any($1) and group_id is not null) as groups`,
    [ids.vehicles],
  );
  const { rows: [docIds] } = await client.query(
    `select array(select id from vehicle_documents where vehicle_id = any($1)) as vdocs,
            array(select id from shop_documents where shop_id = any($2)) as sdocs,
            array(select id from merchant_documents where merchant_user_id = $3) as mdocs,
            array(select id from shop_licenses where merchant_user_id = $3) as licences`,
    [ids.vehicles, ids.shops, merchantId],
  );
  const entities = [...ids.shops, ...ids.vehicles, ...b.bookings, ...docIds.vdocs, ...docIds.sdocs, ...docIds.mdocs, ...docIds.licences];

  await client.query("delete from audit_logs where shop_id = any($1) or entity_id = any($2) or (actor_type = 'MERCHANT' and actor_id = $3)", [ids.shops, entities, merchantId]);
  await client.query("delete from tickets where booking_id = any($1) or (opened_by_type = 'MERCHANT' and opened_by_id = $2)", [b.bookings, merchantId]);
  await client.query("delete from payouts where booking_id = any($1) or merchant_user_id = $2", [b.bookings, merchantId]);
  await client.query("delete from refunds where booking_id = any($1) or payment_id in (select id from payments where booking_group_id = any($2))", [b.bookings, b.groups]);
  await client.query("delete from invoices where booking_group_id = any($1) or shop_id = any($2)", [b.groups, ids.shops]);
  await client.query("delete from bookings where id = any($1)", [b.bookings]);
  // A group can only go once nothing else is in it; demo checkouts are single-vehicle.
  const { rows: emptyGroups } = await client.query(
    "select id from booking_groups g where id = any($1) and not exists (select 1 from bookings x where x.group_id = g.id)", [b.groups]);
  const empty = emptyGroups.map((g) => g.id);
  await client.query("delete from payments where booking_group_id = any($1)", [empty]);
  await client.query("delete from booking_groups where id = any($1)", [empty]);
  await client.query("delete from vehicles where id = any($1)", [ids.vehicles]);
  await client.query("delete from shops where id = any($1)", [ids.shops]);
  await client.query("delete from shop_licenses where merchant_user_id = $1", [merchantId]);
  await client.query("delete from merchant_documents where merchant_user_id = $1", [merchantId]);
  await client.query("delete from merchant_payout_accounts where merchant_user_id = $1", [merchantId]);
  const { rowCount: riders } = await client.query(
    `delete from riders r where (r.name = any($1) or r.name like 'Rider %')
       and not exists (select 1 from bookings x where x.rider_id = r.id)
       and not exists (select 1 from pickup_identity_checks p where p.rider_id = r.id)`,
    [[...RIDER_NAMES, ...LEGACY_RIDER_NAMES]],
  );
  return { shops: ids.shops.length, vehicles: ids.vehicles.length, bookings: b.bookings.length, riders };
}

interface Ctx {
  client: PoolClient;
  merchantId: string;
  staffId: string;
  adminId: string | null;
  now: Date;
}

/** One activity-log row; `shopId` puts it on that shop's Activity log. */
async function audit(c: Ctx, a: { shopId?: string | null; actor?: "MERCHANT" | "ADMIN" | "CUSTOMER"; actorId?: string | null; action: string; entityType: string; entityId: string; after?: object; at?: Date }) {
  await c.client.query(
    `insert into audit_logs (actor_type, actor_id, action, entity_type, entity_id, after, shop_id, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [a.actor ?? "MERCHANT", a.actor === "ADMIN" ? c.adminId : a.actorId ?? c.merchantId, a.action, a.entityType, a.entityId,
      a.after ? JSON.stringify(a.after) : null, a.shopId ?? null, a.at ?? c.now],
  );
}

/** RetroMobi's decision on something, with the reason the merchant reads when it was sent back. */
const decide = (c: Ctx, entityType: string, entityId: string, status: string, note?: string, shopId?: string) =>
  audit(c, { actor: "ADMIN", action: `${entityType}.verification_decided`, entityType, entityId, shopId,
    after: note ? { status, note } : { status }, at: new Date(c.now.getTime() - 2 * DAY) });

async function seedPaper(c: Ctx, table: "shop_documents" | "merchant_documents", owner: { col: string; id: string }, type: string, state: PaperState, number: string | null, note?: string, shopId?: string) {
  const expires = state === "EXPIRED" ? new Date(c.now.getTime() - 20 * DAY) : type === "SHOP_ACT" ? new Date(c.now.getTime() + 400 * DAY) : null;
  const { rows: [doc] } = await c.client.query(
    `insert into ${table} (${owner.col}, type, document_number, expires_at, status, storage_key)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [owner.id, type, number, expires && dateOnly(expires), state === "EXPIRED" ? "VERIFIED" : state, key(`${table}/${owner.id}`)],
  );
  const entity = table === "shop_documents" ? "shop_document" : "merchant_document";
  if (state === "REJECTED") await decide(c, entity, doc.id, "REJECTED", note, shopId);
  return doc.id as string;
}

async function seedVehicle(c: Ctx, shopId: string, modelId: string, fuel: string, base: number, registration: string, state: VehicleState, licenceId: string | null, color: string) {
  const live = ["SHOWING", "BLOCKED", "FESTIVAL"].includes(state);
  const approved = live || ["PAUSED", "EXPIRED_DOC", "WAITING"].includes(state);
  const verification = approved ? "VERIFIED" : state === "CHECKING" ? "PENDING" : state === "REJECTED" ? "REJECTED" : "UNVERIFIED";
  const status = live || state === "EXPIRED_DOC" ? "ACTIVE" : "INACTIVE";
  const { rows: [v] } = await c.client.query(
    `insert into vehicles (shop_id, model_id, registration_number, status, verification_status, color, manufacturing_date, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [shopId, modelId, registration, status, verification, color, `${2021 + (registration.charCodeAt(9) % 4)}-03-01`, new Date(c.now.getTime() - 90 * DAY)],
  );
  const id = v.id as string;
  await audit(c, { shopId, action: "vehicle.created", entityType: "vehicle", entityId: id, at: new Date(c.now.getTime() - 90 * DAY) });

  if (state !== "NEEDS_INFO") {
    const { rows: [p] } = await c.client.query(
      `insert into vehicle_pricing (vehicle_id, amount, weekend_amount, security_deposit_amount, late_fee_amount)
       values ($1, $2, $3, $4, 5000) returning id`,
      [id, base, base + 10000, base < 70000 ? 200000 : 400000],
    );
    if (state === "FESTIVAL") {
      await c.client.query(
        `insert into special_pricings (vehicle_pricing_id, name, amount, weekend_amount, effective_from, effective_until)
         values ($1, 'Diwali week', $2, $3, $4, $5)`,
        [p.id, base + 20000, base + 30000, dateOnly(new Date(c.now.getTime() + 2 * DAY)), dateOnly(new Date(c.now.getTime() + 9 * DAY))],
      );
      await audit(c, { shopId, action: "pricing.special_added", entityType: "vehicle", entityId: id, at: new Date(c.now.getTime() - DAY) });
    }
    for (let n = 0; n < (live || approved ? 2 : 1); n++) {
      await c.client.query(
        "insert into vehicle_media (vehicle_id, storage_key, type, display_order, published) values ($1, $2, 'IMAGE', $3, $4)",
        [id, key(`vehicles/${id}/media`), n, approved],
      );
    }
    await c.client.query("insert into vehicle_accessories (vehicle_id, type, quantity) values ($1, 'HELMET', 2)", [id]);
  }

  const docs = fuel === "ELECTRIC" ? ["RC", "INSURANCE", "FITNESS", "TAX"] : ["RC", "INSURANCE", "PERMIT", "PUC", "FITNESS", "TAX"];
  const life: Record<string, number | null> = { RC: null, INSURANCE: 300, PERMIT: 600, PUC: 120, FITNESS: 900, TAX: 1000 };
  const expiring = fuel === "ELECTRIC" ? "INSURANCE" : "PUC";
  for (const type of state === "NEEDS_INFO" ? ["RC"] : docs) {
    const docStatus = approved ? "VERIFIED" : state === "CHECKING" ? "PENDING"
      : (state === "REJECTED" || state === "DOC_REJECTED") && type === "RC" ? "REJECTED" : state === "NEEDS_INFO" ? "PENDING" : "VERIFIED";
    const days = state === "EXPIRED_DOC" && type === expiring ? -12 : life[type];
    const { rows: [d] } = await c.client.query(
      `insert into vehicle_documents (vehicle_id, type, document_number, expires_at, status, storage_key, verified_at)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [id, type, type === "RC" ? registration : `${type}-${registration.slice(-4)}`, days == null ? null : dateOnly(new Date(c.now.getTime() + days * DAY)),
        docStatus, key(`vehicles/${id}/documents`), docStatus === "VERIFIED" ? c.now : null],
    );
    if (docStatus === "REJECTED") {
      await decide(c, "vehicle_document", d.id, "REJECTED", "The RC photo is blurry and the chassis number can't be read. Upload a sharper photo.", shopId);
    }
  }
  if (state === "REJECTED") {
    await decide(c, "vehicle", id, "REJECTED", "The registration number on the RC doesn't match the number plate in the photos.", shopId);
  }
  if (approved) await decide(c, "vehicle", id, "VERIFIED", undefined, shopId);
  if (state === "BLOCKED") {
    await c.client.query(
      "insert into vehicle_unavailability (vehicle_id, start_at, end_at, reason) values ($1, $2, $3, 'Servicing at the workshop')",
      [id, new Date(c.now.getTime() - 3 * HOUR), new Date(c.now.getTime() + 2 * DAY)],
    );
    await audit(c, { shopId, actorId: c.staffId, action: "vehicle.blocked", entityType: "vehicle", entityId: id, at: new Date(c.now.getTime() - 3 * HOUR) });
  }
  if (licenceId) {
    await c.client.query("insert into license_vehicles (license_id, vehicle_id, registration_number) values ($1, $2, $3)", [licenceId, id, registration]);
  }
  return { id, live, base };
}

interface BookingSpec {
  vehicle: { id: string; base: number };
  shopId: string;
  userId: string;
  rider: string;
  from: Date;
  to: Date;
  collected?: boolean;
  returned?: boolean;
  hold?: boolean;
  cancelledBy?: "CUSTOMER" | "MERCHANT";
  identityChecked?: boolean;
  review?: [number, string];
  claim?: [number, string];
  extension?: "PENDING" | "APPROVED";
  balance?: "PAID" | "PENDING" | "FAILED";
  walkin?: [string, string];
}

async function seedBooking(c: Ctx, s: BookingSpec) {
  const deposit = s.vehicle.base < 70000 ? 200000 : 400000;
  const { rentalAmount } = priceRental({
    pickupAt: s.from, returnAt: s.to,
    pricing: { amount: s.vehicle.base, weekendAmount: s.vehicle.base + 10000, securityDepositAmount: deposit }, specialPricings: [],
  });
  const quote = composeTotal({
    rentalAmount, securityDepositAmount: deposit, discountAmount: 0,
    platformFeePct: Number(process.env.PLATFORM_FEE_PCT ?? 10), gstRate: Number(process.env.GST_RATE ?? 18),
  });
  const created = new Date(Math.min(c.now.getTime() - HOUR, s.from.getTime() - 2 * DAY));
  const actualPickup = s.collected || s.returned ? s.from : null;
  const actualReturn = s.returned ? s.to : null;
  const status = s.hold ? "HOLD" : s.returned ? "COMPLETED" : "CONFIRMED";

  if (s.walkin) {
    const { rows: [b] } = await c.client.query(
      `insert into bookings (vehicle_id, source, walkin_name, walkin_phone, walkin_dl_number, scheduled_pickup_at, scheduled_return_at,
         actual_pickup_at, actual_return_at, status, rental_amount, security_deposit_amount, total_amount, created_at)
       values ($1, 'OFFLINE', $2, $3, 'UK0720190012345', $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [s.vehicle.id, s.walkin[0], s.walkin[1], s.from, s.to, actualPickup, actualReturn, status, rentalAmount, deposit, rentalAmount + deposit, s.from],
    );
    await audit(c, { shopId: s.shopId, actorId: c.staffId, action: "booking.walkin_created", entityType: "booking", entityId: b.id, at: s.from });
    if (s.returned) await audit(c, { shopId: s.shopId, actorId: c.staffId, action: "booking.returned", entityType: "booking", entityId: b.id, at: s.to });
    return b.id as string;
  }

  const rider = await createRider(c.client, s.userId);
  await c.client.query("update riders set name = $2 where id = $1", [rider.id, s.rider]);
  const { rows: [group] } = await c.client.query(
    "insert into booking_groups (user_id, total_amount, hold_expires_at, created_at) values ($1, $2, $3, $4) returning id",
    [s.userId, quote.totalAmount, s.hold ? new Date(c.now.getTime() + 12 * 60_000) : null, s.hold ? c.now : created],
  );
  const { rows: [b] } = await c.client.query(
    `insert into bookings (group_id, rider_id, vehicle_id, scheduled_pickup_at, scheduled_return_at, actual_pickup_at, actual_return_at,
       status, rental_amount, security_deposit_amount, platform_fee, tax_amount, total_amount, created_at, deleted_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) returning id`,
    [group.id, rider.id, s.vehicle.id, s.from, s.to, actualPickup, actualReturn, status, rentalAmount, deposit,
      quote.platformFee, quote.taxAmount, quote.totalAmount, s.hold ? c.now : created, s.cancelledBy ? new Date(created.getTime() + DAY) : null],
  );
  const bookingId = b.id as string;
  const { rows: [payment] } = await c.client.query(
    `insert into payments (booking_group_id, provider_order_id, provider_payment_id, type, amount, status, created_at)
     values ($1, $2, $3, 'RENTAL', $4, $5, $6) returning id`,
    [group.id, `order_${group.id}`, s.hold ? null : `demo-${bookingId}`, quote.totalAmount, s.hold ? "PENDING" : "SUCCEEDED", created],
  );
  if (s.hold) return bookingId;

  const merchantShare = rentalAmount;
  const upfront = Math.round(merchantShare * 0.25);
  await c.client.query(
    `insert into payouts (merchant_user_id, booking_id, stage, amount, status, paid_at, created_at)
     values ($1, $2, 'UPFRONT', $3, $4, $5, $6)`,
    [c.merchantId, bookingId, upfront, s.from < c.now ? "PAID" : "PENDING", s.from < c.now ? created : null, created],
  );

  if (s.cancelledBy) {
    const penalty = s.cancelledBy === "CUSTOMER" ? Math.round(rentalAmount * 0.25) : 0;
    const refundAmount = quote.totalAmount - penalty;
    const { rows: [refund] } = await c.client.query(
      `insert into refunds (payment_id, booking_id, amount, reason, provider_ref, status) values ($1, $2, $3, 'CANCELLATION', $4, 'SUCCEEDED') returning id`,
      [payment.id, bookingId, refundAmount, `cancel_${bookingId}`],
    );
    await c.client.query(
      `insert into booking_cancellations (booking_id, cancelled_by, reason, refund_id, refund_amount, penalty_amount, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [bookingId, s.cancelledBy, s.cancelledBy === "MERCHANT" ? "Vehicle needed urgent repair" : "Plans changed", refund.id, refundAmount, penalty, new Date(created.getTime() + DAY)],
    );
    await c.client.query("insert into security_deposits (booking_id, amount, status, held_at, released_at, refund_amount) values ($1, $2, 'RELEASED', $3, $4, $2)",
      [bookingId, deposit, created, new Date(created.getTime() + DAY)]);
    await audit(c, { shopId: s.shopId, actor: s.cancelledBy === "MERCHANT" ? "MERCHANT" : "CUSTOMER", actorId: s.cancelledBy === "MERCHANT" ? c.merchantId : s.userId,
      action: "booking.cancelled", entityType: "booking", entityId: bookingId, at: new Date(created.getTime() + DAY) });
    return bookingId;
  }

  const deducted = s.claim?.[0] ?? 0;
  await c.client.query(
    `insert into security_deposits (booking_id, amount, status, held_at, released_at, deducted_amount, deduction_reason, refund_amount, settled_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [bookingId, deposit, s.claim ? "PARTIALLY_DEDUCTED" : s.returned ? "RELEASED" : "HELD", created, actualReturn, deducted, s.claim?.[1] ?? null,
      s.returned ? deposit - deducted : 0, s.claim ? actualReturn : null],
  );

  if (actualPickup) {
    await c.client.query(
      `insert into pickup_identity_checks (booking_id, rider_id, checked_by, photo_matched, physical_dl_seen, dl_number_last4, created_at)
       select $1, $2, $3, true, true, right(licence_number, 4), $4 from driving_licence_verifications where rider_id = $2`,
      [bookingId, rider.id, c.staffId, actualPickup],
    );
    await audit(c, { shopId: s.shopId, actorId: c.staffId, action: "booking.handed_over", entityType: "booking", entityId: bookingId, at: actualPickup });
  } else if (s.identityChecked) {
    await c.client.query(
      `insert into pickup_identity_checks (booking_id, rider_id, checked_by, photo_matched, physical_dl_seen, dl_number_last4)
       select $1, $2, $3, true, true, right(licence_number, 4) from driving_licence_verifications where rider_id = $2`,
      [bookingId, rider.id, c.staffId],
    );
    await audit(c, { shopId: s.shopId, actorId: c.staffId, action: "booking.identity_checked", entityType: "booking", entityId: bookingId });
  }

  if (s.returned) {
    await audit(c, { shopId: s.shopId, actorId: c.staffId, action: s.claim ? "booking.returned_claim" : "booking.returned", entityType: "booking", entityId: bookingId, at: s.to });
    const balance = s.balance ?? "PAID";
    await c.client.query(
      `insert into payouts (merchant_user_id, booking_id, stage, amount, status, paid_at, last_error, attempts, created_at)
       values ($1, $2, 'BALANCE', $3, $4, $5, $6, $7, $8)`,
      [c.merchantId, bookingId, merchantShare - upfront, balance, balance === "PAID" ? new Date(s.to.getTime() + DAY) : null,
        balance === "FAILED" ? "Bank rejected the transfer: account name mismatch" : null, balance === "FAILED" ? 3 : balance === "PAID" ? 1 : 0, s.to],
    );
    if (s.claim) {
      await c.client.query(
        "insert into payouts (merchant_user_id, booking_id, stage, amount, status, paid_at) values ($1, $2, 'DEPOSIT_CLAIM', $3, 'PAID', $4)",
        [c.merchantId, bookingId, deducted, new Date(s.to.getTime() + 2 * DAY)],
      );
    }
  }

  if (s.extension) {
    const newReturn = new Date(s.to.getTime() + DAY);
    const amount = s.vehicle.base;
    let paymentId: string | null = null;
    if (s.extension === "APPROVED") {
      const { rows: [p] } = await c.client.query(
        `insert into payments (booking_group_id, provider_order_id, provider_payment_id, type, amount, status, created_at)
         values ($1, $2, $3, 'EXTENSION', $4, 'SUCCEEDED', $5) returning id`,
        [group.id, `order_ext_${bookingId}`, `demo-ext-${bookingId}`, amount, new Date(s.to.getTime() - 2 * DAY)],
      );
      paymentId = p.id;
    }
    // An approved extension already moved the return time; the stored dates are the extended ones.
    await c.client.query(
      `insert into booking_extensions (booking_id, payment_id, old_return_at, new_return_at, additional_amount, status, requested_at, approved_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      s.extension === "APPROVED"
        ? [bookingId, paymentId, new Date(s.to.getTime() - DAY), s.to, amount, "APPROVED", new Date(s.to.getTime() - 2 * DAY), new Date(s.to.getTime() - 2 * DAY)]
        : [bookingId, null, s.to, newReturn, amount, "PENDING", new Date(c.now.getTime() - 2 * HOUR), null],
    );
  }

  if (s.review) {
    await c.client.query(
      "insert into reviews (booking_id, shop_id, user_id, vehicle_id, rating, comment, created_at) values ($1, $2, $3, $4, $5, $6, $7)",
      [bookingId, s.shopId, s.userId, s.vehicle.id, s.review[0], s.review[1], new Date(s.to.getTime() + 3 * HOUR)],
    );
  }
  return bookingId;
}

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Demo data can only be seeded into a local development database");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('retromobi-demo-seed'))");

    const merchant = (await client.query(
      "insert into merchant_users (phone, name) values ($1, 'Test Merchant') on conflict (phone) do update set name = excluded.name returning id", [MERCHANT_PHONE])).rows[0];
    const staff = (await client.query(
      "insert into merchant_users (phone, name) values ($1, 'Demo Counter Staff') on conflict (phone) do update set name = excluded.name returning id", [STAFF_PHONE])).rows[0];
    const manager = (await client.query(
      "insert into merchant_users (phone, name) values ($1, 'Demo Manager') on conflict (phone) do update set name = excluded.name returning id", [MANAGER_PHONE])).rows[0];
    const customer = (await client.query(
      "insert into users (phone, name) values ($1, 'Test Customer') on conflict (phone) do update set name = excluded.name returning id", [CUSTOMER_PHONE])).rows[0];
    const { rows: others } = await client.query(
      "select id from users where status = 'ACTIVE' and deleted_at is null and id <> $1 order by created_at, id limit 8", [customer.id]);
    const admin = (await client.query("select id from admins where deleted_at is null order by created_at limit 1")).rows[0];

    const wiped = await wipe(client, merchant.id);
    const now = new Date();
    const c: Ctx = { client, merchantId: merchant.id, staffId: staff.id, adminId: admin?.id ?? null, now };
    const ago = (days: number) => new Date(now.getTime() - days * DAY);

    // Business papers, shared by every shop. Udyam is optional and left out.
    const owner = { col: "merchant_user_id", id: merchant.id };
    await seedPaper(c, "merchant_documents", owner, "BUSINESS_REG", "VERIFIED", "UDYAM-UK-05-0012345");
    await seedPaper(c, "merchant_documents", owner, "PAN", "VERIFIED", "ABCDE1234F");
    await seedPaper(c, "merchant_documents", owner, "GSTIN", "VERIFIED", "05ABCDE1234F1Z5");
    await client.query(
      `insert into merchant_payout_accounts (merchant_user_id, status, verified_at, holder_name, account_last4, ifsc, beneficiary_id, provider_status)
       values ($1, 'VERIFIED', $2, 'Test Merchant', '4321', 'SBIN0001234', 'demo-beneficiary', 'VERIFIED')`,
      [merchant.id, ago(80)],
    );

    // Transport licences: A and B active, C still being checked, D expired and unlinked.
    const licences: Record<string, string> = {};
    for (const [k, number, status, issued, expires] of [
      ["A", "UK-RAM-2024-0117", "ACTIVE", -400, 700], ["B", "UK-RAM-2025-0342", "ACTIVE", -200, 900],
      ["C", "UK-RAM-2026-0581", "PENDING", -5, 1090], ["D", "UK-RAM-2021-0009", "EXPIRED", -1500, -40],
    ] as const) {
      const { rows: [l] } = await client.query(
        `insert into shop_licenses (merchant_user_id, licence_number, issuing_authority, issued_at, expires_at, status, storage_key)
         values ($1, $2, 'RTO Dehradun', $3, $4, $5, $6) returning id`,
        [merchant.id, number, dateOnly(new Date(now.getTime() + issued * DAY)), dateOnly(new Date(now.getTime() + expires * DAY)), status, key(`licences/${merchant.id}`)],
      );
      licences[k] = l.id;
    }

    const modelIds = {} as Record<ModelKey, string>;
    for (const [k, [make, model, fuel, cc, type]] of Object.entries(MODELS) as [ModelKey, (typeof MODELS)[ModelKey]][]) {
      await client.query(
        `insert into vehicle_models (make, model, fuel_type, engine_cc, class, body_type, seating_capacity)
         values ($1, $2, $3, $4, $5, $5, $6) on conflict (make, model) do nothing`,
        [make, model, fuel, cc, type, model === "42 Bobber" ? 1 : 2],
      );
      modelIds[k] = (await client.query("select id from vehicle_models where make = $1 and model = $2", [make, model])).rows[0].id;
    }

    const shopIds: Record<string, string> = {};
    const live: Record<string, Array<{ id: string; base: number }>> = {};
    let vehicleCount = 0;
    for (const [index, s] of SHOPS.entries()) {
      const { rows: [shop] } = await client.query(
        `insert into shops (merchant_user_id, name, phone, address_line1, landmark, city, state, pincode, latitude, longitude, shop_type, status, verification_status, created_at)
         values ($1, $2, $3, $4, $5, $6, 'Uttarakhand', $7, $8, $9, $10, $11, $12, $13) returning id`,
        [merchant.id, `Demo Rentals · ${s.area}`, `+9198123${String(40100 + index)}`, `Shop ${index + 4}, ${s.area}`, s.landmark ?? null, s.city, s.pincode,
          s.lat, s.lng, s.type, s.closed ? "CLOSED" : "OPEN", s.verify, ago(120 - index * 10)],
      );
      const shopId = shop.id as string;
      shopIds[s.key] = shopId;
      live[s.key] = [];
      await client.query("insert into shop_members (merchant_user_id, shop_id, role) values ($1, $2, 'OWNER')", [merchant.id, shopId]);
      if (s.hours !== false) {
        await client.query(
          `insert into shop_hours (shop_id, day_of_week, opens_at, closes_at)
           select $1, day, $2, $3 from generate_series(0, 6) as day`,
          [shopId, s.key === "mussoorie" ? "09:00" : "08:00", s.city === "Rishikesh" ? "20:00" : "21:00"],
        );
      }
      await audit(c, { shopId, action: "shop.created", entityType: "shop", entityId: shopId, at: ago(120 - index * 10) });
      if (s.verify === "PENDING" || s.verify === "VERIFIED" || s.verify === "REJECTED") {
        await audit(c, { shopId, action: "shop.submitted_for_checking", entityType: "shop", entityId: shopId, at: ago(100 - index * 10) });
      }
      if (s.verify === "VERIFIED" || s.verify === "REJECTED") await decide(c, "shop", shopId, s.verify, s.rejectNote, shopId);
      if (s.licence) await client.query("insert into license_shops (license_id, shop_id) values ($1, $2)", [licences[s.licence], shopId]);
      for (const [type, state] of Object.entries(s.papers) as [keyof ShopSpec["papers"], PaperState][]) {
        await seedPaper(c, "shop_documents", { col: "shop_id", id: shopId }, type, state, type === "SHOP_ACT" ? `UK/SE/${s.pincode}/${index + 101}` : null, s.paperNotes?.[type], shopId);
      }
      for (let n = 0; n < (s.photos ?? 0); n++) {
        await client.query("insert into shop_media (shop_id, storage_key, display_order, published) values ($1, $2, $3, true)",
          [shopId, `shops/${shopId}/media/${randomUUID()}`, n]);
      }
      for (const [unit, [model, state]] of s.vehicles.entries()) {
        const [, , fuel, , , price] = MODELS[model];
        const registration = `UK07DM${String(index + 1).padStart(2, "0")}${String(unit + 1).padStart(2, "0")}`;
        const v = await seedVehicle(c, shopId, modelIds[model], fuel, price + (index % 3) * 3000, registration, state,
          s.licence ? licences[s.licence]! : null, COLORS[(index + unit) % COLORS.length]!);
        if (v.live) live[s.key]!.push(v);
        vehicleCount++;
      }
    }

    // Staff: a counter person at the two Dehradun shops, a manager at the main one, one invite not yet answered.
    for (const shop of ["rajpur", "clocktower"]) {
      await client.query("insert into shop_members (merchant_user_id, shop_id, role) values ($1, $2, 'STAFF')", [staff.id, shopIds[shop]]);
    }
    await client.query("insert into shop_members (merchant_user_id, shop_id, role) values ($1, $2, 'MANAGER')", [manager.id, shopIds.rajpur]);
    await client.query("insert into shop_join_requests (shop_id, requested_by, requested_to, role) values ($1, $2, $3, 'STAFF')", [shopIds.rajpur, merchant.id, INVITE_PHONE]);
    await audit(c, { shopId: shopIds.rajpur, action: "shop.member_joined", entityType: "shop", entityId: shopIds.rajpur!, actorId: staff.id, at: ago(60) });
    await audit(c, { shopId: shopIds.rajpur, action: "shop.member_invited", entityType: "shop", entityId: shopIds.rajpur!, at: ago(1) });

    // Bookings. Times are relative to now; each vehicle's bookings never overlap.
    const istToday = istDate(now);
    const dayStart = new Date(`${istToday}T00:00:00+05:30`);
    const dayEnd = new Date(dayStart.getTime() + DAY - 60_000);
    const at = (hours: number) => new Date(now.getTime() + hours * HOUR);
    const pickupToday = new Date(Math.max(dayStart.getTime(), now.getTime() - 30 * 60_000));
    const returnToday = new Date(Math.max(now.getTime() + 10 * 60_000, Math.min(dayEnd.getTime(), now.getTime() + 2 * HOUR)));
    const r = live.rajpur!;
    const ct = live.clocktower!;
    const tp = live.tapovan!;
    const user = (n: number) => (n === 0 || others.length === 0 ? customer.id : others[(n - 1) % others.length].id);
    const rider = (n: number) => RIDER_NAMES[n % RIDER_NAMES.length]!;
    const specs: BookingSpec[] = [
      // Rajpur Road, every stage a booking can be in.
      { vehicle: r[0]!, shopId: shopIds.rajpur!, userId: customer.id, rider: rider(0), from: at(7 * 24), to: at(9 * 24) }, // upcoming
      { vehicle: r[0]!, shopId: shopIds.rajpur!, userId: customer.id, rider: rider(0), from: ago(10), to: ago(8), returned: true, review: [5, "Spotless scooter and the staff explained everything. Will rent again."] },
      { vehicle: r[1]!, shopId: shopIds.rajpur!, userId: customer.id, rider: rider(1), from: ago(1), to: at(48), collected: true, extension: "PENDING" }, // on ride, asked for one more day
      { vehicle: r[1]!, shopId: shopIds.rajpur!, userId: user(1), rider: rider(2), from: ago(20), to: ago(18), returned: true, review: [2, "Brakes felt soft and the helmet was cracked."] },
      { vehicle: r[2]!, shopId: shopIds.rajpur!, userId: user(2), rider: rider(3), from: ago(2), to: returnToday, collected: true }, // due back today
      { vehicle: r[2]!, shopId: shopIds.rajpur!, userId: user(3), rider: rider(4), from: ago(14), to: ago(12), returned: true, claim: [150000, "Scratched fuel tank and broken left mirror"] },
      { vehicle: r[3]!, shopId: shopIds.rajpur!, userId: customer.id, rider: rider(5), from: ago(2), to: at(-3), collected: true }, // overdue
      { vehicle: r[4]!, shopId: shopIds.rajpur!, userId: customer.id, rider: rider(6), from: pickupToday, to: at(26), identityChecked: true }, // pickup today, licence checked
      { vehicle: r[4]!, shopId: shopIds.rajpur!, userId: user(4), rider: rider(7), from: at(30), to: at(54), cancelledBy: "CUSTOMER" },
      { vehicle: r[5]!, shopId: shopIds.rajpur!, userId: user(5), rider: rider(8), from: at(4), to: at(28) }, // pickup today, not checked yet
      { vehicle: r[6]!, shopId: shopIds.rajpur!, userId: user(6), rider: rider(9), from: ago(1.2), to: at(30) }, // pickup late (yesterday, never came)
      { vehicle: r[7]!, shopId: shopIds.rajpur!, userId: customer.id, rider: rider(10), from: at(72), to: at(96), hold: true }, // awaiting payment
      { vehicle: r[7]!, shopId: shopIds.rajpur!, userId: user(7), rider: rider(11), from: at(5 * 24), to: at(6 * 24), cancelledBy: "MERCHANT" },
      { vehicle: r[7]!, shopId: shopIds.rajpur!, userId: customer.id, rider: rider(12), from: ago(6), to: ago(3), returned: true, extension: "APPROVED", balance: "PENDING" },
      { vehicle: r[8]!, shopId: shopIds.rajpur!, userId: "", rider: "", from: ago(1), to: at(20), collected: true, walkin: ["Suresh Rawat", "+919811122233"] },
      { vehicle: r[6]!, shopId: shopIds.rajpur!, userId: "", rider: "", from: ago(5), to: ago(4), returned: true, walkin: ["Neha Pundir", "+919822233344"] },
      { vehicle: r[3]!, shopId: shopIds.rajpur!, userId: user(1), rider: rider(13), from: ago(9), to: ago(7), returned: true, balance: "FAILED" },
      // Clock Tower and Tapovan, so multi-shop views have numbers too.
      { vehicle: ct[0]!, shopId: shopIds.clocktower!, userId: user(2), rider: rider(14), from: ago(1), to: at(24), collected: true },
      { vehicle: ct[1]!, shopId: shopIds.clocktower!, userId: customer.id, rider: rider(1), from: at(3 * 24), to: at(4 * 24) },
      { vehicle: ct[2]!, shopId: shopIds.clocktower!, userId: user(3), rider: rider(2), from: ago(4), to: ago(2), returned: true, review: [4, "Good bike, pickup took a while."] },
      { vehicle: tp[0]!, shopId: shopIds.tapovan!, userId: user(4), rider: rider(3), from: ago(3), to: ago(1), returned: true, review: [5, "Perfect for the Neelkanth ride."] },
      { vehicle: tp[1]!, shopId: shopIds.tapovan!, userId: customer.id, rider: rider(4), from: pickupToday, to: at(30) },
    ];
    // Two months of finished rides, for Earnings and Reports.
    const reviewsPool: Array<[number, string] | undefined> = [[5, "Smooth ride."], [4, "Clean and on time."], undefined, [3, "Okay, a bit noisy."], undefined, [5, "Great service!"]];
    for (let i = 0; i < 24; i++) {
      const pool = i % 3 === 2 ? ct : r;
      const vehicle = pool[i % pool.length]!;
      const start = ago(24 + Math.floor(i / 8) * 12 + (i % 8));
      specs.push({ vehicle, shopId: pool === ct ? shopIds.clocktower! : shopIds.rajpur!, userId: user(i), rider: rider(i + 3),
        from: start, to: new Date(start.getTime() + (1 + (i % 3)) * DAY), returned: true, review: reviewsPool[i % reviewsPool.length] });
    }
    const bookingIds: string[] = [];
    for (const spec of specs) bookingIds.push(await seedBooking(c, spec));

    // Shop ratings follow their reviews.
    await client.query(
      `update shops s set rating = x.avg, review_count = x.n
         from (select shop_id, round(avg(rating), 1) as avg, count(*)::int as n from reviews where deleted_at is null group by shop_id) x
        where x.shop_id = s.id and s.merchant_user_id = $1`,
      [merchant.id],
    );

    // Help chats: the overdue rider asking for help (open), and an app question the merchant raised (resolved).
    const overdueId = bookingIds[6]!;
    const { rows: [t1] } = await client.query(
      `insert into tickets (booking_id, opened_by_type, opened_by_id, subject, status, category, created_at)
       values ($1, 'CUSTOMER', $2, 'Tyre puncture near Sahastradhara', 'OPEN', 'BOOKING', $3) returning id`,
      [overdueId, customer.id, at(-4)],
    );
    const { rows: [t2] } = await client.query(
      `insert into tickets (opened_by_type, opened_by_id, subject, status, category, resolution, created_at, resolved_at)
       values ('MERCHANT', $1, 'How do I add a second licence?', 'RESOLVED', 'APP_HELP', 'Explained the Licence & papers page.', $2, $3) returning id`,
      [merchant.id, ago(15), ago(14)],
    );
    for (const [ticket, party, partyId] of [[t1.id, "CUSTOMER", customer.id], [t1.id, "MERCHANT", merchant.id], [t2.id, "MERCHANT", merchant.id]] as const) {
      await client.query("insert into ticket_participants (ticket_id, party_type, party_id) values ($1, $2, $3)", [ticket, party, partyId]);
    }
    for (const [ticket, sender, senderId, body, when] of [
      [t1.id, "CUSTOMER", customer.id, "The rear tyre is flat. I'm about 10 km from the shop. What should I do?", at(-4)],
      [t1.id, "MERCHANT", merchant.id, "Stay there, our mechanic is on the way. It'll take about 40 minutes.", at(-3.5)],
      [t2.id, "MERCHANT", merchant.id, "Our new Rishikesh branch has its own licence. Where do I add it?", ago(15)],
      [t2.id, "SYSTEM", merchant.id, "Marked as resolved.", ago(14)],
    ] as const) {
      await client.query("insert into ticket_messages (ticket_id, sender_type, sender_id, body, created_at) values ($1, $2, $3, $4, $5)", [ticket, sender, senderId, body, when]);
    }
    await audit(c, { shopId: shopIds.rajpur, action: "shop.hours_updated", entityType: "shop", entityId: shopIds.rajpur!, at: ago(30) });
    await audit(c, { shopId: shopIds.rajpur, action: "pricing.updated", entityType: "vehicle", entityId: r[0]!.id, at: ago(12) });

    await client.query("commit");
    console.log(`Wiped ${wiped.shops} shops, ${wiped.vehicles} vehicles, ${wiped.bookings} bookings, ${wiped.riders} riders.`);
    console.log(`Seeded ${SHOPS.length} shops, ${vehicleCount} vehicles, ${bookingIds.length} bookings for ${MERCHANT_PHONE}.`);
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
