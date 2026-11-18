-- Shop wallet. Merchants are no longer paid booking by booking: every accrual
-- (UPFRONT at payment, BALANCE at pickup, CANCELLATION top-up, DEPOSIT_CLAIM)
-- is CREDITED to the shop's wallet at the same moment it used to become a
-- transfer, and the merchant withdraws from the wallet when they choose. An
-- admin settles each withdrawal through Cashfree Payouts or offline (bank
-- transfer, UPI, cash), so payouts no longer depend on one vendor.
--
-- The balance is DERIVED, never stored (README rule 5):
--     sum(payouts where status = 'CREDITED', for the shop's bookings)
--   - sum(wallet_withdrawals where status in REQUESTED/PROCESSING/PAID)
-- so a REJECTED or FAILED withdrawal hands the money back by simply no longer
-- counting, with no reversal row to forget. lib/wallet.ts is the one place that
-- computes it.

alter table payouts drop constraint payouts_status_check;
alter table payouts add constraint payouts_status_check
  check (status in ('PENDING', 'PAID', 'FAILED', 'CREDITED'));

-- Accruals that were waiting for a per-booking transfer move into the wallet.
-- One already handed to Cashfree (provider_payout_id set) stays PENDING and
-- outside the wallet: it may yet be paid, and counting it too could pay twice.
update payouts set status = 'CREDITED', updated_at = now()
 where status = 'PENDING' and provider_payout_id is null;

create table wallet_withdrawals (
  id                   uuid primary key default gen_random_uuid(),
  shop_id              uuid not null references shops(id) on delete restrict,
  -- The shop's owner: whose Cashfree beneficiary a CASHFREE_PAYOUT pays.
  merchant_user_id     uuid not null references merchant_users(id) on delete restrict,
  amount               bigint not null check (amount > 0),
  status               text not null default 'REQUESTED'
                       check (status in ('REQUESTED', 'PROCESSING', 'PAID', 'REJECTED', 'FAILED')),
  -- Where the merchant wants it (a UPI id, or bank details for an offline
  -- transfer). Cleared once the withdrawal is settled: it is needed to pay, not
  -- to remember, and the full account number is otherwise never stored (0017).
  pay_to               text,
  -- Chosen by the admin who settles it.
  method               text check (method in ('CASHFREE_PAYOUT', 'BANK_TRANSFER', 'UPI', 'CASH', 'OTHER')),
  -- UTR / UPI ref / receipt number. Required for every offline payment: "paid
  -- in cash" with nothing to point at is not a record.
  reference            text,
  note                 text,
  proof_storage_key    text,
  -- The signed-in merchant user who asked (an owner or a manager of the shop).
  requested_by         uuid references merchant_users(id) on delete set null,
  processed_by         uuid references admins(id) on delete restrict,
  processed_at         timestamptz,
  -- Cashfree Payouts: our deterministic transfer id, so a retry can never pay twice.
  transfer_id          text unique,
  provider_status      text,
  last_error           text,
  attempts             int not null default 0,
  last_attempt_at      timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (status <> 'PAID' or method is not null),
  check (status <> 'PAID' or method = 'CASHFREE_PAYOUT' or reference is not null),
  check (method is distinct from 'CASHFREE_PAYOUT' or status = 'REQUESTED' or transfer_id is not null)
);
create index ix_wallet_withdrawals_shop on wallet_withdrawals (shop_id, created_at desc);
create index ix_wallet_withdrawals_open on wallet_withdrawals (status, created_at)
  where status in ('REQUESTED', 'PROCESSING');
-- Wallet credits are found through booking -> vehicle -> shop.
create index ix_payouts_credited on payouts (booking_id) where status = 'CREDITED';
