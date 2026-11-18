-- One support chat per booking from the customer's side: "Get help" on a
-- booking opens the existing chat (reopening it if it was resolved) instead of
-- starting a second one. Merchant-opened tickets (deposit claims) are separate.
create unique index ux_tickets_customer_booking
  on tickets (booking_id)
  where opened_by_type = 'CUSTOMER' and booking_id is not null;
