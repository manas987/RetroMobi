-- Which licence classes may ride which vehicle class. See
-- docs/dl-verification.md; the table itself is created in 0015.
--
-- `vehicle_models.class` only ever holds 'SCOOTER' or 'MOTORCYCLE' (set by
-- DB/seed.ts's findOrCreateModel from bodyType, and by the admin Models
-- form), so those are the two rules. A model whose class is null or unmapped
-- has NO rule, which fails closed as NO_RULE -- deliberately, because the
-- alternative is guessing an entitlement from a vehicle's display name.
--
-- COV codes are canonicalised in lib/licenceEligibility.ts, which also holds
-- the alias table for the several ways Vahan spells each one.
--
-- MCWG covers MCWOG: a rider entitled to a geared motorcycle may ride a
-- gearless scooter. The reverse is not true, which is why MOTORCYCLE does not
-- list MCWOG. LMV alone entitles nobody to a two-wheeler, so it appears in
-- neither.
--
-- min_age_years is 18 for both. The Motor Vehicles Act allows 16 for a
-- gearless two-wheeler up to 50cc, but nothing in the fleet is under 50cc and
-- rental insurance conditions are stricter than the Act -- so 18, as a rental
-- policy on top of the legal floor, not as a reading of the law.
--
-- reviewed_by IS NULL ON PURPOSE. This mapping is a legal question and has not
-- been reviewed by anyone qualified. Production is blocked on filling
-- reviewed_by/reviewed_at -- see docs/dl-verification-checklist.md.
insert into vehicle_class_licence_rules
  (vehicle_class, allowed_cov, min_age_years, policy_version)
values
  ('SCOOTER',    '{MCWOG,MCWG,MC50CC}', 18, 'v1'),
  ('MOTORCYCLE', '{MCWG}',              18, 'v1')
on conflict (vehicle_class, policy_version) do nothing;

-- The RTO's OWN status string for the licence, e.g. 'Active'. There was
-- nowhere to put it: driving_licence_verifications.status is *our* state
-- (PENDING/VERIFIED/REJECTED), which is a different fact -- we can have
-- verified that a licence exists and still not know whether it is suspended.
-- Eligibility treats a null here as STATUS_UNKNOWN (a review, never a pass and
-- never fraud), so legacy rows are covered by the grace window rather than
-- silently approved.
alter table driving_licence_verifications add column licence_status text;
