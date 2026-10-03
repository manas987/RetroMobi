-- Admins log in with the same phone-OTP flow, but signup is CLOSED:
-- SUPER_ADMIN provisions the row, an unknown phone is rejected.
-- status = ACTIVE means available for ticket assignment.
create table admins (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null unique,
  email      text unique,
  name       text,
  role       text not null check (role in ('SUPER_ADMIN','ADMIN','SUPPORT')),
  status     text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table admin_sessions (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid not null references admins(id) on delete cascade,
  token_hash   text not null,
  device_id    text not null,
  expires_at   timestamptz not null,       -- 12h, shorter than customer/merchant
  revoked_at   timestamptz,
  last_used_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create unique index uq_admin_sessions_token_hash on admin_sessions (token_hash);
create index ix_admin_sessions_admin on admin_sessions (admin_id);

create table admin_otp_challenges (
  id            uuid primary key default gen_random_uuid(),
  target        text not null,
  channel       text not null default 'SMS' check (channel in ('SMS','EMAIL')),
  purpose       text not null default 'LOGIN_OR_SIGNUP' check (purpose in ('LOGIN_OR_SIGNUP')),
  otp_hash      text not null,
  expires_at    timestamptz not null,
  attempt_count int not null default 0,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index ix_admin_otp_target_created on admin_otp_challenges (target, created_at desc);

-- ONE ticket system. A damage dispute needs customer + merchant + support in a
-- single thread, which two separate ticket tables cannot express.
create table tickets (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid references bookings(id) on delete set null,   -- nullable: account issues have no booking
  opened_by_type text not null check (opened_by_type in ('CUSTOMER','MERCHANT')),
  opened_by_id  uuid not null,
  assigned_to   uuid references admins(id) on delete set null,
  subject       text,
  status        text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','RESOLVED')),
  resolution    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index ix_tickets_assigned on tickets (assigned_to) where status <> 'RESOLVED';
create index ix_tickets_booking on tickets (booking_id);

create table ticket_participants (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references tickets(id) on delete cascade,
  party_type text not null check (party_type in ('CUSTOMER','MERCHANT','ADMIN')),
  party_id   uuid not null,
  joined_at  timestamptz not null default now()
);
create unique index uq_ticket_participants on ticket_participants (ticket_id, party_type, party_id);

-- Read with ?since=<id> cursor polling. The service only ever answers "messages
-- after this cursor", so adding WebSocket later is a push path over the same
-- query rather than a rewrite.
create table ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references tickets(id) on delete cascade,
  sender_type text not null check (sender_type in ('CUSTOMER','MERCHANT','ADMIN')),
  sender_id   uuid not null,
  body        text,
  created_at  timestamptz not null default now()
);
create index ix_ticket_messages_cursor on ticket_messages (ticket_id, created_at, id);

create table ticket_attachments (
  id               uuid primary key default gen_random_uuid(),
  message_id       uuid not null references ticket_messages(id) on delete cascade,
  storage_key      text not null,
  file_name        text,
  size_bytes       bigint,
  duration_seconds int,
  created_at       timestamptz not null default now()
);
create index ix_ticket_attachments_message on ticket_attachments (message_id);

-- Captures EVERY write, deliberately: this feeds metrics, warnings and analytics,
-- not just compliance.
-- ponytail: no partitioning or retention policy. This will become the largest
-- table in the DB; add monthly partitions when its size starts affecting backups.
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_type  text not null check (actor_type in ('CUSTOMER','MERCHANT','ADMIN','SYSTEM')),
  actor_id    uuid,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index ix_audit_logs_entity on audit_logs (entity_type, entity_id, created_at desc);
create index ix_audit_logs_actor on audit_logs (actor_type, actor_id, created_at desc);
create index ix_audit_logs_created on audit_logs (created_at desc);

-- SMS (Twilio) for time-sensitive events, email (Resend) for receipts and invoices.
create table notifications (
  id             uuid primary key default gen_random_uuid(),
  recipient_type text not null check (recipient_type in ('CUSTOMER','MERCHANT','ADMIN')),
  recipient_id   uuid not null,
  channel        text not null check (channel in ('SMS','EMAIL')),
  template       text not null,
  payload        jsonb,
  status         text not null default 'PENDING' check (status in ('PENDING','SENT','FAILED')),
  error          text,
  sent_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index ix_notifications_pending on notifications (status, created_at) where status = 'PENDING';

-- IP rate limiting for the public search routes, same Postgres-backed pattern as
-- otp_challenges. No Redis.
create table rate_limits (
  id           uuid primary key default gen_random_uuid(),
  key          text not null,              -- ip + ':' + route
  window_start timestamptz not null,
  count        int not null default 1
);
create unique index uq_rate_limits_key_window on rate_limits (key, window_start);
create index ix_rate_limits_window on rate_limits (window_start);
