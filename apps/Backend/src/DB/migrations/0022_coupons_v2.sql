-- Coupons v2: who pays for the discount, where it applies, and who qualifies.
--
-- funded_by PLATFORM: RetroMobi pays. The shop is credited its full listed
--   price (lib/wallet.ts shows the discount as a platform reimbursement) and the
--   discount comes off RetroMobi's own fee invoice. This was the only kind before.
-- funded_by SHOP: the shop pays. Its wallet credit and its tax invoice are on
--   the discounted price, so the discount is a price reduction the shop granted.
--
-- Eligibility rules live in `conditions` (jsonb), validated by ONE zod schema
-- (lib/coupons.ts, CouponConditionsSchema), so a new rule type needs code but
-- no migration. Limits stay columns because they are counted in SQL.

alter table coupons
  add column funded_by        text not null default 'PLATFORM' check (funded_by in ('PLATFORM', 'SHOP')),
  -- null = every shop. A SHOP-funded coupon must name the shops paying for it.
  add column shop_ids         uuid[],
  add column description      text,
  add column created_by_admin uuid references admins(id) on delete set null,
  add column created_by_merchant uuid references merchant_users(id) on delete set null,
  -- Cap for PERCENT coupons ("20% off, up to ₹200"), paise.
  add column max_discount     bigint check (max_discount is null or max_discount > 0),
  -- The ticket size: the eligible rental total must reach this, paise.
  add column min_order_amount bigint not null default 0 check (min_order_amount >= 0),
  add column per_user_limit   int check (per_user_limit is null or per_user_limit > 0),
  add column per_shop_limit   int check (per_shop_limit is null or per_shop_limit > 0),
  add column conditions       jsonb not null default '{}'::jsonb,
  add constraint coupons_shop_funded_names_shops
    check (funded_by = 'PLATFORM' or coalesce(cardinality(shop_ids), 0) >= 1);

-- The part of bookings.discount_amount the SHOP pays (0 for a platform coupon).
-- Everything that computes what the shop earns or invoices subtracts this, so
-- the rule is one column read, not a coupon lookup in five places.
alter table bookings
  add column merchant_discount_amount bigint not null default 0
    check (merchant_discount_amount >= 0 and merchant_discount_amount <= discount_amount);

-- One row per booking that used a coupon, written when its payment succeeds.
-- The per-user, per-shop and total limits are counted from here, so an unpaid
-- hold never uses a coupon up.
create table coupon_redemptions (
  id               uuid primary key default gen_random_uuid(),
  coupon_id        uuid not null references coupons(id) on delete restrict,
  user_id          uuid not null references users(id) on delete restrict,
  booking_group_id uuid not null references booking_groups(id) on delete restrict,
  booking_id       uuid not null unique references bookings(id) on delete restrict,
  shop_id          uuid not null references shops(id) on delete restrict,
  discount_amount  bigint not null check (discount_amount >= 0),
  funded_by        text not null check (funded_by in ('PLATFORM', 'SHOP')),
  created_at       timestamptz not null default now()
);
create index ix_coupon_redemptions_coupon_user on coupon_redemptions (coupon_id, user_id);
create index ix_coupon_redemptions_coupon_shop on coupon_redemptions (coupon_id, shop_id);
