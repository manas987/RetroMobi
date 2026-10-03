-- Admin-curated catalog. Merchants pick from this list and cannot create models;
-- free text would give three spellings of "Activa 6G" and fragment grouped search.
create table vehicle_models (
  id               uuid primary key default gen_random_uuid(),
  make             text not null,
  model            text not null,
  class            text,
  fuel_type        text check (fuel_type in ('PETROL','ELECTRIC')),
  engine_cc        int,
  body_type        text,
  seating_capacity int,
  image_key        text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
create unique index uq_vehicle_models on vehicle_models (make, model);

-- status is the MARKETPLACE TOGGLE, not a service state. RetroMobi ships as a
-- fleet management system first; INACTIVE means managed but invisible to customers.
create table vehicles (
  id                  uuid primary key default gen_random_uuid(),
  shop_id             uuid not null references shops(id) on delete restrict,
  model_id            uuid not null references vehicle_models(id) on delete restrict,
  registration_number text not null unique,
  manufacturing_date  date,
  color               text,
  status              text not null default 'INACTIVE' check (status in ('ACTIVE','INACTIVE')),
  verification_status text not null default 'UNVERIFIED'
                      check (verification_status in ('UNVERIFIED','PENDING','VERIFIED','REJECTED')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index ix_vehicles_shop on vehicles (shop_id) where deleted_at is null;
create index ix_vehicles_model on vehicles (model_id) where deleted_at is null;
create index ix_vehicles_active on vehicles (shop_id, model_id) where deleted_at is null and status = 'ACTIVE';

-- Internal compliance record. Form 2 enumerates registration numbers per branch
-- (docs/02-legal.md). Admin fills this from the uploaded licence; merchants never
-- see it. It backs the verification badge and does NOT gate bookability.
create table license_vehicles (
  id                  uuid primary key default gen_random_uuid(),
  license_id          uuid not null references shop_licenses(id) on delete cascade,
  vehicle_id          uuid not null references vehicles(id) on delete cascade,
  registration_number text not null,
  added_at            timestamptz not null default now(),
  removed_at          timestamptz
);
create unique index uq_license_vehicles_active on license_vehicles (vehicle_id) where removed_at is null;

create table vehicle_registration_records (
  id                    uuid primary key default gen_random_uuid(),
  vehicle_id            uuid not null references vehicles(id) on delete cascade,
  registration_number   text not null,
  registration_date     date,
  registering_authority text,
  engine_number         text,
  chassis_number        text,
  manufacturer          text,
  model                 text,
  vehicle_class         text,
  body_type             text,
  fuel_type             text,
  color                 text,
  manufacturing_date    date,
  seating_capacity      int,
  gross_weight          int,
  unladen_weight        int,
  cubic_capacity        int,
  financer              text,
  tax_valid_until       date,
  status_date           date,
  verified_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index ix_vrr_vehicle on vehicle_registration_records (vehicle_id);

create table vehicle_documents (
  id              uuid primary key default gen_random_uuid(),
  vehicle_id      uuid not null references vehicles(id) on delete cascade,
  type            text not null check (type in ('RC','INSURANCE','FITNESS','PUC','PERMIT','TAX')),
  document_number text,
  issued_at       date,
  expires_at      date,
  status          text not null default 'PENDING'
                  check (status in ('PENDING','VERIFIED','REJECTED','EXPIRED')),
  storage_key     text,
  verified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index ix_vehicle_documents_vehicle on vehicle_documents (vehicle_id) where deleted_at is null;

create table vehicle_media (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references vehicles(id) on delete cascade,
  storage_key   text not null,
  type          text not null default 'IMAGE' check (type in ('IMAGE','VIDEO')),
  display_order int not null default 0,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index ix_vehicle_media_vehicle on vehicle_media (vehicle_id, display_order) where deleted_at is null;

-- Informational only. Never priced, never selectable at checkout.
create table vehicle_accessories (
  id         uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  type       text not null,
  quantity   int not null default 1,
  status     text not null default 'AVAILABLE' check (status in ('AVAILABLE','UNAVAILABLE'))
);
create index ix_vehicle_accessories_vehicle on vehicle_accessories (vehicle_id);

-- All money is integer paise. late_fee_amount is DISPLAYED and quoted by support
-- in a deposit-claim ticket; it is never charged automatically.
create table vehicle_pricing (
  id                      uuid primary key default gen_random_uuid(),
  vehicle_id              uuid not null references vehicles(id) on delete cascade,
  amount                  bigint not null,
  weekend_amount          bigint not null,
  security_deposit_amount bigint not null default 0,
  late_fee_amount         bigint not null default 0,
  currency                text not null default 'INR',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create unique index uq_vehicle_pricing_vehicle on vehicle_pricing (vehicle_id);

-- Applies PER DAY, not per booking: a rental clipping one peak day does not
-- price the whole stay at peak.
create table special_pricings (
  id                 uuid primary key default gen_random_uuid(),
  vehicle_pricing_id uuid not null references vehicle_pricing(id) on delete cascade,
  name               text not null,
  amount             bigint not null,
  weekend_amount     bigint not null,
  effective_from     date not null,
  effective_until    date not null,
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  check (effective_until >= effective_from)
);
create index ix_special_pricings_range on special_pricings (vehicle_pricing_id, effective_from, effective_until)
  where deleted_at is null;

create table vehicle_unavailability (
  id         uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  reason     text,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index ix_vehicle_unavailability_vehicle on vehicle_unavailability (vehicle_id, start_at, end_at);

-- flespi is a universal telematics gateway: one integration reads nearly every
-- tracker protocol. Read-only passthrough, no telemetry stored.
create table trackers (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null default 'FLESPI',
  device_identifier text not null,
  status            text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  last_seen_at      timestamptz,
  battery_level     int,
  created_at        timestamptz not null default now()
);
create unique index uq_trackers_device on trackers (provider, device_identifier);

create table vehicle_tracker_assignments (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references vehicles(id) on delete cascade,
  tracker_id    uuid not null references trackers(id) on delete cascade,
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz
);
create unique index uq_tracker_assignment_active on vehicle_tracker_assignments (vehicle_id)
  where unassigned_at is null;
