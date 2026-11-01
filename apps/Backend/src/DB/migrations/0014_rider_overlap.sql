-- A rider is a physical person: they cannot be riding two scooters at once.
-- Mirrors no_overlapping_bookings (0009) for vehicle_id -- same reasoning,
-- app-level checks cannot prevent two concurrent requests from both reading
-- "no conflict" before either inserts. Walk-ins (rider_id null) are exempt.
alter table bookings add constraint no_overlapping_rider_bookings
  exclude using gist (
    rider_id with =,
    tstzrange(scheduled_pickup_at, scheduled_return_at) with &&
  ) where (deleted_at is null and rider_id is not null);
