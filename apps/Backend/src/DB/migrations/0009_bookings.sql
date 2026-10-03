create extension if not exists btree_gist;

-- Super admins create, pause, soft-delete and hard-delete these.
create table coupons (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  type        text not null check (type in ('PERCENT','FLAT')),
  value       bigint not null,            -- percent (0-100) or paise
  valid_from  timestamptz not null,
  valid_until timestamptz not null,
  max_uses    int,
  used_count  int not null default 0,
  status      text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED')),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (valid_until > valid_from)
);

-- A customer can book up to 5 vehicles in one checkout. The exclusion constraint
-- below needs one row per vehicle, so the group is a parent: payment and the hold
-- clock live here, everything else is per vehicle.
create table booking_groups (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete restrict,
  coupon_id       uuid references coupons(id) on delete set null,
  total_amount    bigint not null default 0,
  hold_expires_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index ix_booking_groups_user on booking_groups (user_id) where deleted_at is null;
create index ix_booking_groups_hold on booking_groups (hold_expires_at) where hold_expires_at is not null;

-- Walk-in rentals (source = OFFLINE) write rows here too, so marketplace
-- availability is correct without a second code path. Walk-ins have no group,
-- no rider row, and no payments row.
create table bookings (
  id                      uuid primary key default gen_random_uuid(),
  group_id                uuid references booking_groups(id) on delete cascade,
  rider_id                uuid references riders(id) on delete restrict,
  vehicle_id              uuid not null references vehicles(id) on delete restrict,
  source                  text not null default 'ONLINE' check (source in ('ONLINE','OFFLINE')),

  walkin_name             text,
  walkin_phone            text,
  walkin_dl_number        text,

  scheduled_pickup_at     timestamptz not null,
  scheduled_return_at     timestamptz not null,
  actual_pickup_at        timestamptz,
  actual_return_at        timestamptz,

  status                  text not null check (status in ('HOLD','CONFIRMED','COMPLETED')),

  rental_amount           bigint not null default 0,
  security_deposit_amount bigint not null default 0,
  platform_fee            bigint not null default 0,
  tax_amount              bigint not null default 0,
  discount_amount         bigint not null default 0,
  total_amount            bigint not null default 0,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz,

  check (scheduled_return_at > scheduled_pickup_at),
  -- Online bookings need a rider; walk-ins need a name instead.
  check (
    (source = 'ONLINE'  and rider_id is not null and group_id is not null)
    or
    (source = 'OFFLINE' and walkin_name is not null)
  )
);

-- THE load-bearing constraint. Application-level conflict checks cannot prevent
-- double-booking: two requests both read "no conflict" before either inserts.
-- Keyed on deleted_at because there is no CANCELLED status — a cancelled booking
-- is soft-deleted, which is what frees the slot.
alter table bookings add constraint no_overlapping_bookings
  exclude using gist (
    vehicle_id with =,
    tstzrange(scheduled_pickup_at, scheduled_return_at) with &&
  ) where (deleted_at is null);

create index ix_bookings_group on bookings (group_id) where deleted_at is null;
create index ix_bookings_vehicle on bookings (vehicle_id) where deleted_at is null;
create index ix_bookings_rider on bookings (rider_id) where deleted_at is null;
create index ix_bookings_hold on bookings (status) where status = 'HOLD' and deleted_at is null;

create table booking_extensions (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references bookings(id) on delete cascade,
  payment_id        uuid,
  old_return_at     timestamptz not null,
  new_return_at     timestamptz not null,
  additional_amount bigint not null,
  status            text not null default 'APPROVED' check (status in ('APPROVED','REJECTED')),
  requested_at      timestamptz not null default now(),
  approved_at       timestamptz,
  check (new_return_at > old_return_at)
);
create index ix_booking_extensions_booking on booking_extensions (booking_id);

create table booking_cancellations (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references bookings(id) on delete cascade,
  cancelled_by   text not null check (cancelled_by in ('CUSTOMER','MERCHANT','ADMIN','SYSTEM')),
  reason         text,
  refund_id      uuid,
  refund_amount  bigint not null default 0,
  penalty_amount bigint not null default 0,
  created_at     timestamptz not null default now()
);
create index ix_booking_cancellations_booking on booking_cancellations (booking_id);

-- Pickup video only. Confirming the upload is what sets actual_pickup_at.
-- There is no return video: return evidence rides in ticket chat attachments.
create table vehicle_inspections (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  storage_key text not null,
  created_at  timestamptz not null default now()
);
create unique index uq_vehicle_inspections_booking on vehicle_inspections (booking_id);

-- Charged inside the RENTAL payment, not separately. Released immediately on a
-- clean return; HELD when the merchant files a claim, which opens a ticket.
create table security_deposits (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references bookings(id) on delete cascade,
  amount           bigint not null,
  status           text not null default 'HELD'
                   check (status in ('HELD','RELEASED','CLAIMED','PARTIALLY_DEDUCTED')),
  held_at          timestamptz,
  released_at      timestamptz,
  deducted_amount  bigint not null default 0,
  deduction_reason text,
  refund_amount    bigint not null default 0,
  refund_id        uuid,
  created_at       timestamptz not null default now()
);
create unique index uq_security_deposits_booking on security_deposits (booking_id);
