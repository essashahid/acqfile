alter table workspaces add column firm_name text not null default '';
alter table deals add column contact_name text not null default '', add column contact_email text not null default '', add column send_by date;
alter table workspace_members drop constraint workspace_members_role_check;
alter table workspace_members add constraint workspace_members_role_check check(role in ('admin','reviewer','viewer','adviser'));
create table portal_links (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references deals(id), party_id uuid not null references parties(id),
 token_hash text not null unique, created_by uuid not null references app_users(id),
 created date not null, revoked date, last_seen date
);
create table portal_responses (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references deals(id), party_id uuid references parties(id), link_id uuid references portal_links(id),
 task_key text not null, kind text not null, payload jsonb not null, audit_event_id uuid not null references events(id), created_at timestamptz not null default now()
);
alter table portal_links enable row level security;
alter table portal_responses enable row level security;
-- All access goes through the token- or workspace-authorized backend.
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke all on portal_links,portal_responses from anon; end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on portal_links,portal_responses from authenticated; end if;
end $$;
