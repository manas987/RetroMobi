-- Merchant payouts are accrued (0010_payments.sql) and have never been PAID:
-- nothing in the codebase called cashfree.transfer(), and the endpoint it
-- pointed at (/pg/easy-split/transfers) does not exist. The replacement is the
-- Cashfree Payouts product (V2), which pays a registered BENEFICIARY -- so the
-- payout account needs enough to register one, and the payout row needs
-- somewhere to record why a transfer did not happen.
--
-- Full API contract: docs/payments.md, "Payouts V2".

alter table merchant_payout_accounts
  -- Our own id at Cashfree (`merch_<merchant_user_id>`), returned by
  -- POST /payout/beneficiary and the only thing a transfer needs afterwards.
  add column beneficiary_id     text,
  add column holder_name        text,
  -- The account NUMBER IS NOT STORED. It is sent to Cashfree once, to register
  -- the beneficiary, and after that only the beneficiary id is needed -- so
  -- keeping it would be a liability with no use, exactly like a full licence
  -- number (migration 0015). The last four and the IFSC are what a merchant
  -- needs to recognise which of their accounts this is.
  add column account_last4      text,
  add column ifsc               text,
  -- Cashfree's own beneficiary_status, kept verbatim beside our mapped
  -- `status`: VERIFIED / INVALID / INITIATED / CANCELLED / FAILED / DELETED.
  add column provider_status    text,
  add column last_error         text;

create index ix_payout_accounts_beneficiary on merchant_payout_accounts (beneficiary_id)
  where deleted_at is null;

alter table payouts
  -- Why the last attempt did not pay. Visible in the admin "Payouts out" tab,
  -- which selects *, so a stuck payout stops being invisible.
  add column last_error      text,
  add column attempts        int not null default 0,
  add column last_attempt_at timestamptz;

-- The sweep claims the oldest PENDING payouts that are due another attempt.
create index ix_payouts_pending on payouts (last_attempt_at nulls first, created_at)
  where status = 'PENDING';
