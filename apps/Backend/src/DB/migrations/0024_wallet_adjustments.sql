-- Manual corrections to a shop wallet, by an admin, always with a reason: a
-- goodwill credit, a fee recovered, a booking fixed by hand. Signed paise,
-- append-only like every other money row (README rule 5). lib/wallet.ts adds
-- them into the derived balance and refuses one that would take it below zero.
create table wallet_adjustments (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops(id) on delete restrict,
  amount     bigint not null check (amount <> 0),
  reason     text not null check (length(trim(reason)) >= 3),
  created_by uuid not null references admins(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index ix_wallet_adjustments_shop on wallet_adjustments (shop_id, created_at desc);

-- An admin can pay a shop without the shop asking first (e.g. cash handed over
-- at the counter), so a withdrawal may have no merchant requester. Already
-- nullable; recorded here so the reason is findable next to the table.
comment on column wallet_withdrawals.requested_by is
  'merchant user who asked; null when an admin paid the shop directly';
