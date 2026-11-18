-- Handover code: one 6-digit code per paid order, sent to the customer on
-- WhatsApp (delivery_code template) and shown on their order page. Staff must
-- enter it at handover, so the scooter goes to the person who booked it.
-- Stored in plain text on purpose: the customer has to be able to see it.
alter table booking_groups
  add column handover_code text check (handover_code ~ '^[0-9]{6}$');

-- Orders already paid get a code too, so their handover is not blocked.
update booking_groups g
   set handover_code = lpad(floor(random() * 1000000)::int::text, 6, '0')
 where exists (select 1 from bookings b where b.group_id = g.id and b.status in ('CONFIRMED', 'COMPLETED'));
