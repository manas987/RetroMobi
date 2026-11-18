-- Phone notifications go out as WhatsApp templates now (Twilio is gone).
-- 'SMS' stays allowed: older rows carry it, and the sweep delivers any SMS row
-- over WhatsApp, so a call site not yet switched still reaches the customer.
alter table notifications drop constraint notifications_channel_check;
alter table notifications add constraint notifications_channel_check
  check (channel in ('SMS', 'WHATSAPP', 'EMAIL'));
