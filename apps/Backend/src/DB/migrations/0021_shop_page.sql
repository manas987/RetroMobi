-- Shop page: a landmark line, shop photos, and per-shop papers.
-- Additive only. See docs/shop-page-plan.md.
alter table shops add column landmark text;

-- Mirrors vehicle_media (0008 + 0018). Photos only.
create table shop_media (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  storage_key   text not null,
  display_order int not null default 0,
  published     boolean not null default false,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index ix_shop_media_shop on shop_media (shop_id, display_order) where deleted_at is null;

-- Mirrors merchant_documents (0007), but belongs to one shop: the Shop Act /
-- trade licence and premises papers are per storefront, not per business.
create table shop_documents (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  type            text not null check (type in ('SHOP_ACT','PREMISES','LANDLORD_NOC')),
  document_number text,
  issued_at       date,
  expires_at      date,
  status          text not null default 'PENDING'
                  check (status in ('PENDING','VERIFIED','REJECTED','EXPIRED')),
  storage_key     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index ix_shop_documents_shop on shop_documents (shop_id) where deleted_at is null;
