-- Lets a shop see its own activity log. Older rows stay null and simply don't show.
alter table audit_logs add column shop_id uuid references shops(id) on delete set null;
create index ix_audit_logs_shop on audit_logs (shop_id, created_at desc) where shop_id is not null;
