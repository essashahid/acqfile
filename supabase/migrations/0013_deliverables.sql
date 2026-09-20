-- Phase 5: findings lifecycle (A48), template requests (A49) and immutable snapshots.
alter table findings
  add column resolved_by_json jsonb,
  add column reason text,
  add column request_id uuid,
  add column requested_at timestamptz,
  add column resolved_at timestamptz,
  add column actor_id uuid references app_users(id);
alter table findings drop constraint if exists findings_status_check;
alter table findings add constraint findings_status_check
  check(status in ('open','requested','resolved','dismissed','waived'));

create table requests(
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id),
  responsible text not null,
  body text not null,
  finding_keys text[] not null,
  status text not null default 'draft' check(status in ('draft','sent')),
  sent_at timestamptz,
  actor_id uuid not null references app_users(id),
  created_at timestamptz not null default now()
);
create index requests_deal on requests(deal_id);

create table snapshots(
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id),
  number integer not null,
  evaluation_id uuid not null references evaluations(id),
  content_json jsonb not null,
  diff_json jsonb not null,
  actor_id uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  unique(deal_id, number)
);
create trigger snapshots_immutable before update or delete on snapshots
  for each row execute function reject_domain_mutation();
alter table requests enable row level security;
alter table snapshots enable row level security;
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then
    revoke all on requests,snapshots from anon;
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    revoke all on requests,snapshots from authenticated;
  end if;
end $$;
