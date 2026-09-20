-- Phase 4 Step B: operator attestations, extracted ownership beside declared ownership, legacy report path retired (A41, A42).
create table attestations(
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id),
  kind text not null check(kind in ('tracking','manual_confirmation','waiver')),
  rule_id text not null, scope_key text not null, period text not null default '', key text not null default '',
  state text check(state in ('not_started','ordered','received')), confirmed boolean,
  note text not null, actor_id uuid not null references app_users(id), audit_event_id uuid not null references events(id),
  created_at timestamptz not null default now(),
  unique(deal_id,kind,rule_id,scope_key,period,key)
);
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid='ownership_links'::regclass and contype='u' loop
    execute format('alter table ownership_links drop constraint %I', c);
  end loop;
end $$;
alter table ownership_links add constraint ownership_links_identity unique(deal_id,owner_party_id,owned_party_id,stage,origin);
-- A42: the inherited field-value tables, report evaluation and review queue are retired; facts is the single store (A41).
drop table if exists qa_reports, eval_results, eval_runs, eval_cases, review_actions, review_items, field_evidence, field_values, extraction_runs, processing_run_documents, source_blocks cascade;
alter table record_versions drop column if exists extraction_run_id, drop column if exists model_config_hash;
