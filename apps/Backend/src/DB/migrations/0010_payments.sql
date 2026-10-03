-- Payment is per GROUP (one UPI intent for all five scooters); payouts stay per
-- BOOKING because a group can span two shops. The deposit is charged inside the
-- RENTAL payment, so there is no DEPOSIT type.
create table payments (
  id                  uuid primary key default gen_random_uuid(),
  booking_group_id    uuid not null references booking_groups(id) on delete restrict,
  provider            text not null default 'CASHFREE',
  provider_payment_id text,
  provider_order_id   text,
  type                text not null check (type in ('RENTAL','EXTENSION','EXTRA_CHARGE')),
  amount              bigint not null,
  currency            text not null default 'INR',
  status              text not null default 'PENDING'
                      check (status in ('PENDING','AUTHORIZED','SUCCEEDED','FAILED','CANCELLED')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index ix_payments_group on payments (booking_group_id);
create index ix_payments_provider_order on payments (provider_order_id);

create table refunds (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references payments(id) on delete restrict,
  booking_id   uuid references bookings(id) on delete set null,  -- null = whole-group refund
  amount       bigint not null,
  currency     text not null default 'INR',
  reason       text,
  provider_ref text,
  status       text not null default 'PENDING'
               check (status in ('PENDING','SUCCEEDED','FAILED')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index ix_refunds_payment on refunds (payment_id);

-- Cashfree can deliver the same event twice. Insert the event id BEFORE
-- processing; a unique violation means it is already handled, so ack and stop.
-- Same philosophy as no_overlapping_bookings: the database is the referee.
create table webhook_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null default 'CASHFREE',
  provider_event_id  text not null,
  payload            jsonb not null,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz
);
create unique index uq_webhook_events_provider_event on webhook_events (provider, provider_event_id);

-- Two invoices per group: the SHOP bills the rental under its own GSTIN, and
-- RetroMobi bills the platform fee under its own. Indian GST requires unbroken
-- sequential numbering per issuer per financial year -- a gap after real money
-- has moved is an accounting problem, not a bug fix.
create table invoices (
  id               uuid primary key default gen_random_uuid(),
  booking_group_id uuid not null references booking_groups(id) on delete restrict,
  shop_id          uuid references shops(id) on delete restrict,
  issuer_type      text not null check (issuer_type in ('MERCHANT','PLATFORM')),
  issuer_gstin     text,
  financial_year   text not null,            -- '2026-27'
  sequence_number  int not null,
  invoice_number   text not null,            -- 'RM/2026-27/000142'
  taxable_amount   bigint not null,
  cgst             bigint not null default 0,
  sgst             bigint not null default 0,
  igst             bigint not null default 0,
  total            bigint not null,
  issued_at        timestamptz not null default now()
);
create unique index uq_invoices_number on invoices (invoice_number);
create unique index uq_invoices_sequence on invoices (issuer_type, coalesce(shop_id, '00000000-0000-0000-0000-000000000000'::uuid), financial_year, sequence_number);
create index ix_invoices_group on invoices (booking_group_id);

-- stage UPFRONT  = PAYOUT_UPFRONT_PCT released at payment confirmation
-- stage BALANCE  = the remainder, released when pickup happens
-- stage CANCELLATION = top-up when a cancellation tier owes more than UPFRONT
-- There is never a clawback, only a top-up.
create table payouts (
  id                 uuid primary key default gen_random_uuid(),
  merchant_user_id   uuid not null references merchant_users(id) on delete restrict,
  booking_id         uuid not null references bookings(id) on delete restrict,
  stage              text not null check (stage in ('UPFRONT','BALANCE','CANCELLATION')),
  amount             bigint not null,
  currency           text not null default 'INR',
  status             text not null default 'PENDING'
                     check (status in ('PENDING','PAID','FAILED')),
  provider           text not null default 'CASHFREE',
  provider_payout_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  paid_at            timestamptz
);
create unique index uq_payouts_booking_stage on payouts (booking_id, stage);
create index ix_payouts_merchant on payouts (merchant_user_id);

-- Allowed once actual_pickup_at is set, not gated on return. One per booking.
-- Writing one recomputes shops.rating + review_count in the SAME transaction.
create table reviews (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  shop_id    uuid not null references shops(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index uq_reviews_booking on reviews (booking_id) where deleted_at is null;
create index ix_reviews_shop on reviews (shop_id) where deleted_at is null;
