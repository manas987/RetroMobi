-- Gap-free invoice numbering without a read-then-write race.
--
-- "select max(sequence_number) + 1" inside the payment webhook is a race: two
-- concurrent confirmations both read the same max, both insert, one hits the
-- unique constraint and the whole webhook transaction rolls back -- meaning a
-- customer paid and their booking never confirmed. Indian GST requires an
-- unbroken sequence, so the counter is a locked row instead.
--
-- Allocate with a single atomic statement:
--   insert into invoice_sequences (issuer_type, shop_id, financial_year, last_number)
--   values ($1, $2, $3, 1)
--   on conflict (issuer_type, coalesce(shop_id, '00000000-0000-0000-0000-000000000000'::uuid), financial_year)
--   do update set last_number = invoice_sequences.last_number + 1
--   returning last_number;
create table invoice_sequences (
  id             uuid primary key default gen_random_uuid(),
  issuer_type    text not null check (issuer_type in ('MERCHANT','PLATFORM')),
  shop_id        uuid references shops(id) on delete cascade,   -- null for PLATFORM
  financial_year text not null,
  last_number    int not null default 0,
  updated_at     timestamptz not null default now()
);
create unique index uq_invoice_sequences on invoice_sequences
  (issuer_type, coalesce(shop_id, '00000000-0000-0000-0000-000000000000'::uuid), financial_year);

-- These three columns were plain uuids pointing at nothing, so a bad write would
-- have been silently accepted and only surfaced as a broken money trail later.
alter table booking_extensions
  add constraint fk_booking_extensions_payment
  foreign key (payment_id) references payments(id) on delete set null;

alter table booking_cancellations
  add constraint fk_booking_cancellations_refund
  foreign key (refund_id) references refunds(id) on delete set null;

alter table security_deposits
  add constraint fk_security_deposits_refund
  foreign key (refund_id) references refunds(id) on delete set null;
