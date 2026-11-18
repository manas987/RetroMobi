alter table bookings
  add column pickup_verification_session_id uuid references rider_verification_sessions(id),
  add column pickup_licence_ack_at timestamptz,
  add constraint booking_pickup_licence_ack
    check ((pickup_verification_session_id is null) = (pickup_licence_ack_at is null));
