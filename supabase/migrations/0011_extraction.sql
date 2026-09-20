-- Phase 4 Step A: extraction facts carry verification detail; review items cover extraction gaps.
alter table facts
  add column document_version_id uuid references document_versions(id),
  add column verifier_reason text,
  add column validation_json jsonb not null default '[]'::jsonb,
  add column corrected_value_json jsonb,
  add column ambiguity text,
  add column review_note text;
create index facts_segment_current on facts(segment_id) where is_current;
create index facts_deal_current on facts(deal_id) where is_current;
alter table intake_reviews
  add column segment_id uuid references segments(id),
  add column attribute text;
alter table intake_reviews drop constraint intake_reviews_type_check;
alter table intake_reviews add constraint intake_reviews_type_check
  check(type in ('unreadable','segmentation','classification','party_assignment','version_conflict','extraction_gap','identifier_mismatch'));
drop index if exists intake_review_open;
create unique index intake_review_open on intake_reviews(document_version_id,type,coalesce(segment_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(attribute,'')) where status='open';
