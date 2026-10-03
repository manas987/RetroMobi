-- Three product decisions taken on 2026-10-03 need room the schema does not have.
-- Added as a new numbered migration, never by editing 0009-0011.

-- 1. Extensions are now PAY FIRST, then extend. The old check constraint only
--    allowed APPROVED/REJECTED, so an extension awaiting payment could not be
--    represented at all -- the row had to be written as already approved, which is
--    exactly the bug (the booking extended whether or not the money arrived).
alter table booking_extensions drop constraint booking_extensions_status_check;
alter table booking_extensions
  add constraint booking_extensions_status_check
  check (status in ('PENDING', 'APPROVED', 'REJECTED'));
alter table booking_extensions alter column status set default 'PENDING';

-- The extension's payment is the thing that approves it, so one pending extension
-- per booking at a time -- otherwise a customer could open five payment sheets and
-- land five overlapping extensions on the same vehicle.
create unique index uq_booking_extensions_pending on booking_extensions (booking_id)
  where status = 'PENDING';

-- 2. A support agent settling a deposit claim pays the deducted part to the
--    merchant. That is a fourth payout stage; uq_payouts_booking_stage already
--    keeps it to one per booking.
alter table payouts drop constraint payouts_stage_check;
alter table payouts
  add constraint payouts_stage_check
  check (stage in ('UPFRONT', 'BALANCE', 'CANCELLATION', 'DEPOSIT_CLAIM'));

-- 3. A ticket opens with an automated message asking what it is about. That message
--    has no human sender, and 'SYSTEM' is already an accepted actor_type in
--    audit_logs, so the vocabulary is consistent.
alter table ticket_messages drop constraint ticket_messages_sender_type_check;
alter table ticket_messages
  add constraint ticket_messages_sender_type_check
  check (sender_type in ('CUSTOMER', 'MERCHANT', 'ADMIN', 'SYSTEM'));

-- The answer to that automated question. Null until the opener picks one, which is
-- why it is nullable rather than defaulted -- "not yet answered" and "general query"
-- are different states and the support queue sorts on the difference.
alter table tickets add column category text
  check (category in ('BOOKING', 'APP_HELP', 'OTHER'));

-- A deposit claim is settled once. Without this, a second settlement would write a
-- second refund and a second payout against the same held money.
alter table security_deposits add column settled_at timestamptz;
alter table security_deposits add column settled_by uuid references admins(id) on delete set null;
