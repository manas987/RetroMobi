create table if not exists schema_migrations (
  filename   text primary key,
  applied_at timestamptz not null default now()
);

create table users (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null unique,          -- E.164, +91 only this pass
  email      text unique,
  status     text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','DELETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    text not null,              -- sha256(refresh token), rotated in place
  device_id     text not null,
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  last_used_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create unique index uq_sessions_token_hash on sessions (token_hash);
create index ix_sessions_user_id on sessions (user_id);

create table otp_challenges (
  id            uuid primary key default gen_random_uuid(),
  target        text not null,              -- phone, E.164
  channel       text not null default 'SMS' check (channel in ('SMS')),
  purpose       text not null default 'LOGIN_OR_SIGNUP' check (purpose in ('LOGIN_OR_SIGNUP')),
  otp_hash      text not null,
  expires_at    timestamptz not null,
  attempt_count int not null default 0,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index ix_otp_challenges_target_created on otp_challenges (target, created_at desc);
