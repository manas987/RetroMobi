alter table users add column deleted_at timestamptz;

-- A customer account holds many riders. Signup auto-creates rider #1 from the
-- signup name; the account holder is a rider like any other.
create table riders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  name       text not null,
  dob        date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index ix_riders_user_id on riders (user_id) where deleted_at is null;

create table driving_licence_verifications (
  id                 uuid primary key default gen_random_uuid(),
  rider_id           uuid not null references riders(id) on delete cascade,
  provider           text not null,
  licence_number     text not null,
  status             text not null check (status in ('PENDING','VERIFIED','REJECTED')),
  valid_from         date,
  expires_on         date,
  issuing_authority  text,
  provider_reference text,
  verified_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index ix_dlv_rider_id on driving_licence_verifications (rider_id, created_at desc);

create table driving_licence_categories (
  id                      uuid primary key default gen_random_uuid(),
  licence_verification_id uuid not null references driving_licence_verifications(id) on delete cascade,
  code                    text not null,
  abbreviation            text,
  description             text,
  issue_date              date,
  endorse_date            date
);
create index ix_dlc_verification_id on driving_licence_categories (licence_verification_id);
