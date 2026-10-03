-- Merchants are their own auth stack, separate from customer `users`.
-- Same phone-OTP flow, different tables. A merchant is a person who owns shops;
-- there is no merchant organisation entity.
create table merchant_users (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null unique,
  email      text unique,
  name       text,
  email_verified_at timestamptz,
  status     text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','DELETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table merchant_sessions (
  id           uuid primary key default gen_random_uuid(),
  merchant_user_id uuid not null references merchant_users(id) on delete cascade,
  token_hash   text not null,
  device_id    text not null,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create unique index uq_merchant_sessions_token_hash on merchant_sessions (token_hash);
create index ix_merchant_sessions_user on merchant_sessions (merchant_user_id);

create table merchant_otp_challenges (
  id            uuid primary key default gen_random_uuid(),
  target        text not null,
  channel       text not null check (channel in ('SMS','EMAIL')),
  purpose       text not null check (purpose in ('LOGIN_OR_SIGNUP','EMAIL_VERIFICATION')),
  otp_hash      text not null,
  expires_at    timestamptz not null,
  attempt_count int not null default 0,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index ix_merchant_otp_target_created on merchant_otp_challenges (target, created_at desc);

-- The shop IS the pickup and return point. There is no rental_locations table:
-- a merchant with two yards creates two shops, so search distance is exact.
create table shops (
  id                  uuid primary key default gen_random_uuid(),
  merchant_user_id    uuid not null references merchant_users(id) on delete restrict,
  name                text not null,
  phone               text,
  email               text,
  shop_type           text not null default 'MAIN' check (shop_type in ('MAIN','BRANCH')),
  address_line1       text not null,
  city                text not null,
  state               text not null,
  pincode             text not null,
  latitude            double precision,
  longitude           double precision,
  gstin               text,
  status              text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  verification_status text not null default 'UNVERIFIED'
                      check (verification_status in ('UNVERIFIED','PENDING','VERIFIED','REJECTED')),
  rating              numeric(2,1),
  review_count        int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
-- City search is a lowercase text match; this index is what makes it usable.
create index ix_shops_city_lower on shops (lower(city)) where deleted_at is null;
create index ix_shops_merchant on shops (merchant_user_id) where deleted_at is null;
create index ix_shops_latlng on shops (latitude, longitude) where deleted_at is null;

create table shop_members (
  id               uuid primary key default gen_random_uuid(),
  merchant_user_id uuid not null references merchant_users(id) on delete cascade,
  shop_id          uuid not null references shops(id) on delete cascade,
  role             text not null check (role in ('OWNER','MANAGER','STAFF')),
  status           text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED')),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create unique index uq_shop_members on shop_members (shop_id, merchant_user_id) where deleted_at is null;

create table shop_join_requests (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references shops(id) on delete cascade,
  requested_by uuid not null references merchant_users(id) on delete cascade,
  requested_to text not null,                -- phone, may not have an account yet
  role         text not null check (role in ('OWNER','MANAGER','STAFF')),
  status       text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REJECTED')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);
create index ix_join_requests_shop on shop_join_requests (shop_id);

create table shop_hours (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  opens_at    time not null,
  closes_at   time not null
);
create unique index uq_shop_hours on shop_hours (shop_id, day_of_week);

-- One Rent-a-Motor-Cycle licence can cover several branches. See docs/02-legal.md.
create table shop_licenses (
  id                uuid primary key default gen_random_uuid(),
  merchant_user_id  uuid not null references merchant_users(id) on delete cascade,
  licence_number    text not null,
  issuing_authority text,
  issued_at         date,
  expires_at        date,
  status            text not null default 'PENDING'
                    check (status in ('PENDING','ACTIVE','EXPIRED','REJECTED')),
  storage_key       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index ix_shop_licenses_merchant on shop_licenses (merchant_user_id) where deleted_at is null;

create table license_shops (
  id          uuid primary key default gen_random_uuid(),
  license_id  uuid not null references shop_licenses(id) on delete cascade,
  shop_id     uuid not null references shops(id) on delete cascade,
  branch_type text,
  created_at  timestamptz not null default now()
);
create unique index uq_license_shops on license_shops (license_id, shop_id);

create table merchant_verifications (
  id                 uuid primary key default gen_random_uuid(),
  merchant_user_id   uuid not null references merchant_users(id) on delete cascade,
  provider           text not null,
  type               text not null,
  status             text not null check (status in ('PENDING','VERIFIED','REJECTED')),
  provider_reference text,
  consent_reference  text,
  verified_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index ix_merchant_verifications_user on merchant_verifications (merchant_user_id);

create table merchant_documents (
  id               uuid primary key default gen_random_uuid(),
  merchant_user_id uuid not null references merchant_users(id) on delete cascade,
  type             text not null,
  document_number  text,
  issued_at        date,
  expires_at       date,
  status           text not null default 'PENDING'
                   check (status in ('PENDING','VERIFIED','REJECTED','EXPIRED')),
  storage_key      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index ix_merchant_documents_user on merchant_documents (merchant_user_id) where deleted_at is null;

create table merchant_payout_accounts (
  id                   uuid primary key default gen_random_uuid(),
  merchant_user_id     uuid not null references merchant_users(id) on delete cascade,
  provider             text not null default 'CASHFREE',
  provider_account_ref text,
  status               text not null default 'PENDING'
                       check (status in ('PENDING','VERIFIED','REJECTED')),
  verified_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);
create index ix_payout_accounts_merchant on merchant_payout_accounts (merchant_user_id) where deleted_at is null;
