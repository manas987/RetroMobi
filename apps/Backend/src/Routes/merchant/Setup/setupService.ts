import type { Pool } from "pg";
import { MIN_VEHICLES_FOR_SHOP, REQUIRED_VEHICLE_DOCS } from "../../../lib/vehicleBookingRules.ts";
import { ShopNotFoundError } from "../Shops/shopsService.ts";

export type DocState = "MISSING" | "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";

/**
 * Where a vehicle sits on the setup board, in the merchant's words:
 * NEEDS_INFO "add these things" -> CHECKING "RetroMobi is checking" ->
 * READY "ready to show" -> SHOWING "showing on RetroMobi"; NEEDS_FIXING when
 * something was rejected or a document expired.
 */
export type SetupStage = "NEEDS_INFO" | "NEEDS_FIXING" | "CHECKING" | "READY" | "SHOWING";

// Latest admin decision note for a REJECTED row (decisions are audited with after.note).
const rejectionNote = (entityType: string, idCol: string) => `(
  select a.after->>'note' from audit_logs a
   where a.entity_type = '${entityType}' and a.entity_id = ${idCol}
     and a.action = '${entityType}.verification_decided' and a.after->>'status' = 'REJECTED'
   order by a.created_at desc limit 1
)`;

const IST_TODAY = `(now() at time zone 'Asia/Kolkata')::date`;

/**
 * Everything the "Get listed" wizard and the fleet setup board need, built
 * entirely from server state so leaving and coming back always lands on the
 * next unfinished step.
 */
export async function getShopSetup(pool: Pool, shopId: string) {
  const shopRes = await pool.query(
    `select s.id, s.name, s.merchant_user_id, s.verification_status,
            s.latitude is not null and s.longitude is not null and s.address_line1 is not null as has_address,
            exists (select 1 from shop_hours h where h.shop_id = s.id) as has_hours,
            case when s.verification_status = 'REJECTED' then ${rejectionNote("shop", "s.id")} end as rejection_note
       from shops s where s.id = $1 and s.deleted_at is null`,
    [shopId],
  );
  const shop = shopRes.rows[0];
  if (!shop) throw new ShopNotFoundError(`shop ${shopId} not found`);

  // Licences belong to the merchant; one linked to this branch wins, then the healthiest.
  const licenceRes = await pool.query(
    `select l.id, l.status, l.expires_at, l.storage_key is not null as has_file,
            l.expires_at is not null and l.expires_at < ${IST_TODAY} as expired,
            case when l.status = 'REJECTED' then ${rejectionNote("shop_licence", "l.id")} end as rejection_note
       from shop_licenses l
      where l.merchant_user_id = $1 and l.deleted_at is null
      order by exists (select 1 from license_shops ls where ls.license_id = l.id and ls.shop_id = $2) desc,
               array_position(array['ACTIVE','PENDING','EXPIRED','REJECTED'], l.status),
               l.created_at desc
      limit 1`,
    [shop.merchant_user_id, shopId],
  );
  const lic = licenceRes.rows[0];
  const licence = {
    status: !lic ? "NONE" : lic.expired && lic.status === "ACTIVE" ? "EXPIRED" : (lic.status as string),
    expiresAt: lic?.expires_at ?? null,
    hasFile: lic?.has_file ?? false,
    rejectionNote: lic?.rejection_note ?? null,
  };

  const payoutRes = await pool.query(
    `select status from merchant_payout_accounts
      where merchant_user_id = $1 and deleted_at is null
      order by created_at desc limit 1`,
    [shop.merchant_user_id],
  );
  const payoutAccount = { status: (payoutRes.rows[0]?.status as string | undefined) ?? "NONE" };

  const vehicleRes = await pool.query(
    `select v.id, m.make, m.model, v.registration_number, v.status, v.verification_status,
            vp.vehicle_id is not null as price_set,
            (select count(*)::int from vehicle_media vm
              where vm.vehicle_id = v.id and vm.deleted_at is null and vm.type = 'IMAGE') as photo_count,
            exists (select 1 from vehicle_registration_records r where r.vehicle_id = v.id) as has_registration,
            exists (select 1 from license_vehicles lv join shop_licenses sl on sl.id = lv.license_id
                     where lv.vehicle_id = v.id and lv.removed_at is null and sl.deleted_at is null
                       and sl.status = 'ACTIVE' and (sl.expires_at is null or sl.expires_at >= ${IST_TODAY})) as licence_linked,
            case when v.verification_status = 'REJECTED' then ${rejectionNote("vehicle", "v.id")} end as rejection_note,
            coalesce((
              select json_agg(json_build_object(
                       'id', d.id, 'type', d.type, 'status', d.status, 'hasFile', d.storage_key is not null,
                       'expired', d.expires_at is not null and d.expires_at < ${IST_TODAY},
                       'note', case when d.status = 'REJECTED' then ${rejectionNote("vehicle_document", "d.id")} end))
                from (select distinct on (type) * from vehicle_documents
                       where vehicle_id = v.id and deleted_at is null
                       order by type, created_at desc) d
            ), '[]') as docs
       from vehicles v
       join vehicle_models m on m.id = v.model_id
       left join vehicle_pricing vp on vp.vehicle_id = v.id
      where v.shop_id = $1 and v.deleted_at is null
      order by v.created_at`,
    [shopId],
  );

  const shopVerified = shop.verification_status === "VERIFIED";
  const vehicles = vehicleRes.rows.map((v) => {
    const docs: Record<string, { state: DocState; id: string | null; note: string | null }> = {};
    for (const type of REQUIRED_VEHICLE_DOCS) docs[type] = { state: "MISSING", id: null, note: null };
    for (const d of v.docs as Array<Record<string, any>>) {
      if (!(REQUIRED_VEHICLE_DOCS as readonly string[]).includes(d.type)) continue;
      const state: DocState = !d.hasFile ? "MISSING" : d.expired ? "EXPIRED" : d.status;
      docs[d.type] = { state, id: d.id, note: d.note ?? null };
    }

    const missing: string[] = [];
    if (!v.price_set) missing.push("price");
    if (v.photo_count === 0) missing.push("photo");
    for (const type of REQUIRED_VEHICLE_DOCS) {
      if (["MISSING", "REJECTED", "EXPIRED"].includes(docs[type]!.state)) missing.push(`doc:${type}`);
    }

    const ready = v.verification_status === "VERIFIED" && shopVerified && v.licence_linked;
    const broken =
      v.verification_status === "REJECTED" ||
      REQUIRED_VEHICLE_DOCS.some((t) => ["REJECTED", "EXPIRED"].includes(docs[t]!.state));
    const stage: SetupStage =
      ready && v.status === "ACTIVE"
        ? "SHOWING"
        : ready
          ? "READY"
          : broken
            ? "NEEDS_FIXING"
            : v.verification_status === "PENDING" || v.verification_status === "VERIFIED"
              ? "CHECKING"
              : "NEEDS_INFO";

    return {
      id: v.id as string,
      make: v.make as string,
      model: v.model as string,
      registrationNumber: v.registration_number as string,
      status: v.status as "ACTIVE" | "INACTIVE",
      verificationStatus: v.verification_status as string,
      rejectionNote: (v.rejection_note as string | null) ?? null,
      priceSet: v.price_set as boolean,
      photoCount: v.photo_count as number,
      hasRegistration: v.has_registration as boolean,
      licenceLinked: v.licence_linked as boolean,
      docs,
      missing,
      stage,
      /** Every required item is in and it isn't already submitted or verified. */
      canSubmit: missing.length === 0 && ["UNVERIFIED", "REJECTED"].includes(v.verification_status),
      /** What a VERIFIED vehicle is still waiting on before it can show. */
      waitingFor: v.verification_status === "VERIFIED" && !ready
        ? [...(shopVerified ? [] : ["shop"]), ...(v.licence_linked ? [] : ["licence"])]
        : [],
    };
  });

  const completeVehicles = vehicles.filter((v) => v.missing.length === 0).length;
  const steps = {
    shop: shop.has_address && shop.has_hours,
    licence: ["ACTIVE", "PENDING"].includes(licence.status),
    vehicles: completeVehicles > 0,
    payout: ["PENDING", "VERIFIED"].includes(payoutAccount.status),
    submitted: ["PENDING", "VERIFIED"].includes(shop.verification_status),
  };

  return {
    shop: {
      id: shop.id as string,
      name: shop.name as string,
      verificationStatus: shop.verification_status as string,
      rejectionNote: (shop.rejection_note as string | null) ?? null,
      hasAddress: shop.has_address as boolean,
      hasHours: shop.has_hours as boolean,
    },
    licence,
    payoutAccount,
    vehicles,
    requiredDocs: [...REQUIRED_VEHICLE_DOCS],
    minVehiclesForShop: MIN_VEHICLES_FOR_SHOP,
    completeVehicles,
    steps,
    done: Object.values(steps).every(Boolean) && shopVerified,
  };
}
