-- Rider DL & identity verification. Full design: docs/dl-verification.md.
--
-- The existing tables (riders, driving_licence_verifications,
-- driving_licence_categories from 0006) are extended, not replaced -- their
-- columns already match the DigiLocker issued-document XML spec one for one.
-- What was missing is everything around them: a state machine, a consent
-- record, the holder's photograph, a legally-reviewed vehicle-class mapping,
-- and a record that a human compared a face to a licence at handover.

-- One row per verification attempt. The state machine lives here.
create table rider_verification_sessions (
  id                 uuid primary key default gen_random_uuid(),
  rider_id           uuid not null references riders(id) on delete cascade,
  user_id            uuid not null references users(id) on delete cascade,
  method             text not null check (method in ('DIGILOCKER','DL_NUMBER')),
  provider           text not null,
  -- NOT_STARTED is deliberately absent: a session row only exists once one has
  -- started, so "not started" is the absence of a row, not a value.
  state              text not null check (state in (
                       'CONSENT_PENDING','DOCUMENT_PENDING','DOCUMENT_VERIFIED',
                       'DOCUMENT_FAILED','PHOTO_PENDING','MANUAL_REVIEW_REQUIRED',
                       'VERIFIED','REJECTED','EXPIRED','REVOKED')),
  -- OUR id, minted before the vendor is called and sent to it. The vendor has
  -- no request id of its own, and a client-supplied one is how the old
  -- DigiLocker callback could be pointed at someone else's verification.
  verification_id    text not null unique,
  provider_reference text,
  assurance_level    text check (assurance_level in ('HIGH','MEDIUM','LOW')),
  policy_version     text not null,
  rejection_code     text,
  review_required    boolean not null default false,
  -- The exact words the customer agreed to, not a boolean. DPDP Rule 3 wants
  -- purpose-specific consent, and "they ticked something once" is not evidence.
  -- Null only for rows backfilled from before this table existed, where no
  -- consent was ever recorded -- see the check below, which makes lying about
  -- that impossible.
  consent_text       text,
  consent_at         timestamptz,
  consent_ip         text,
  -- The SESSION's expiry, not the licence's.
  expires_at         timestamptz not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint consent_recorded_unless_legacy check (
    policy_version = 'legacy' or (consent_text is not null and consent_at is not null)
  )
);
create index ix_rvs_rider on rider_verification_sessions (rider_id, created_at desc);
create index ix_rvs_review on rider_verification_sessions (state) where review_required;

-- Append-only. Every transition, including the ones a vendor caused.
create table rider_verification_events (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references rider_verification_sessions(id) on delete cascade,
  actor_type     text not null check (actor_type in ('CUSTOMER','MERCHANT','ADMIN','PROVIDER','SYSTEM')),
  actor_id       uuid,
  event_type     text not null,
  previous_state text,
  next_state     text,
  correlation_id text,
  -- MASKED ONLY. lib/maskSecrets.ts redact() is the only writer.
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index ix_rve_session on rider_verification_events (session_id, created_at);

-- The photograph the merchant compares a face against. R2 key only -- the
-- bytes never enter Postgres, and the vendor's presigned URL is never stored
-- because it expires in 24 hours and a stored dead link looks like a working one.
create table verification_photos (
  id           uuid primary key default gen_random_uuid(),
  rider_id     uuid not null references riders(id) on delete cascade,
  session_id   uuid references rider_verification_sessions(id) on delete set null,
  source       text not null check (source in ('DIGILOCKER_ISSUED','RTO_RECORD','SELF_UPLOADED')),
  storage_key  text not null,
  content_type text not null,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index ix_vp_rider on verification_photos (rider_id, created_at desc) where deleted_at is null;

-- Which licence classes may ride what. Configurable and versioned because it
-- is a legal mapping that must be reviewed, not guessed from a vehicle's
-- display name. reviewed_by null = seeded, NOT yet reviewed; production is
-- blocked on filling it (see dl-verification-checklist.md).
create table vehicle_class_licence_rules (
  id             uuid primary key default gen_random_uuid(),
  vehicle_class  text not null,
  allowed_cov    text[] not null,
  min_age_years  int not null,
  policy_version text not null,
  reviewed_by    text,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);
create unique index uq_vclr on vehicle_class_licence_rules (vehicle_class, policy_version);

-- The merchant's eyeball, recorded. With automated face matching deliberately
-- dropped, THIS IS THE ONLY EVIDENCE binding a human to a licence -- which is
-- why it is a row with an author and a timestamp rather than a UI checkbox.
create table pickup_identity_checks (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references bookings(id) on delete cascade,
  rider_id         uuid not null references riders(id),
  checked_by       uuid not null references merchant_users(id),
  photo_matched    boolean not null,
  physical_dl_seen boolean not null,
  dl_number_last4  text,
  notes            text,
  created_at       timestamptz not null default now()
);
create unique index uq_pic_booking on pickup_identity_checks (booking_id);

alter table driving_licence_verifications
  add column session_id          uuid references rider_verification_sessions(id),
  -- sha256(normalised + DL_HASH_PEPPER). Duplicate detection across accounts
  -- without keeping the number that would make the duplicate worth stealing.
  add column licence_number_hash text,
  add column source_type         text check (source_type in ('DIGILOCKER_ISSUED','RTO_RECORD')),
  -- When the transport record was last touched, i.e. how fresh this answer is.
  add column source_at           timestamptz,
  add column holder_name         text,
  add column photo_available     boolean not null default false;
create index ix_dlv_licence_hash on driving_licence_verifications (licence_number_hash);

-- licence_number stops holding the real number. It was already the display
-- field, so from here it holds the MASK (DL14********1234) and the hash above
-- carries identity. Nothing stores the full number: a renewal re-check asks
-- the customer to retype a number they are holding, which is cheaper than
-- owning a database of driving licence numbers.
comment on column driving_licence_verifications.licence_number is
  'MASKED (e.g. DL14********1234). The full number is never stored; see licence_number_hash.';

-- One session per existing verification, so the booking gate and Profile keep
-- working. policy_version 'legacy' marks them: no consent was recorded, there
-- may be no category data, and Phase 3's eligibility check treats them under
-- the LEGACY_LICENCE_GRACE_UNTIL rule rather than silently passing them.
insert into rider_verification_sessions
  (rider_id, user_id, method, provider, state, verification_id, provider_reference,
   assurance_level, policy_version, expires_at, created_at, updated_at)
select dlv.rider_id,
       r.user_id,
       case when dlv.provider = 'DIGILOCKER' then 'DIGILOCKER' else 'DL_NUMBER' end,
       dlv.provider,
       case dlv.status when 'VERIFIED' then 'VERIFIED' when 'REJECTED' then 'REJECTED'
                       else 'DOCUMENT_PENDING' end,
       'legacy:' || dlv.id::text,
       dlv.provider_reference,
       'LOW',
       'legacy',
       dlv.created_at,
       dlv.created_at,
       dlv.updated_at
  from driving_licence_verifications dlv
  join riders r on r.id = dlv.rider_id;

update driving_licence_verifications dlv
   set session_id = s.id,
       source_type = case when dlv.provider = 'DIGILOCKER' then 'DIGILOCKER_ISSUED' else 'RTO_RECORD' end
  from rider_verification_sessions s
 where s.verification_id = 'legacy:' || dlv.id::text;

-- The hash backfill and the masking of licence_number are NOT done here:
-- digest() needs pgcrypto, which this database does not have, and the hash
-- must be computed with the same pepper the application uses. Run
--     bun run src/DB/backfillLicenceHashes.ts
-- once, immediately after this migration. It computes the hash FIRST and masks
-- afterwards -- the other order destroys the input forever.
