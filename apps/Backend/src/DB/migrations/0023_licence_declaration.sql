-- Beta: no online licence check. Every online booking is a declared one -- the
-- customer ticks two statements and the shop checks the original at pickup --
-- so the acknowledgement no longer implies an outage session.
alter table bookings
  drop constraint booking_pickup_licence_ack,
  add constraint booking_pickup_licence_ack
    check (pickup_verification_session_id is null or pickup_licence_ack_at is not null);
