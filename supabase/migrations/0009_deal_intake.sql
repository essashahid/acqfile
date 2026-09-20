-- Phase 3 intake. Retain the legacy extraction/review schema.
alter table deals add column revision integer not null default 1;
alter table parties add column external_key text;
create unique index parties_external_key on parties(deal_id,external_key);
alter table document_versions add column deal_id uuid references deals(id);
update document_versions v set deal_id=d.deal_id from documents d where d.id=v.document_id;
alter table document_versions drop constraint document_versions_workspace_id_content_hash_key;
create unique index version_deal_hash on document_versions(workspace_id,coalesce(deal_id,'00000000-0000-0000-0000-000000000000'::uuid),content_hash);
create function set_version_deal() returns trigger language plpgsql as $$ begin
 new.deal_id := (select deal_id from documents where id=new.document_id); return new;
end $$;
create trigger version_deal before insert or update of document_id on document_versions for each row execute function set_version_deal();
create table deal_batches(id uuid primary key default gen_random_uuid(),deal_id uuid not null references deals(id),number integer not null,actor_id uuid not null references app_users(id),created_at timestamptz not null default now(),unique(deal_id,number));
create table intake_files(id uuid primary key default gen_random_uuid(),batch_id uuid not null references deal_batches(id),document_version_id uuid not null references document_versions(id),original_path text not null,content_hash text not null,duplicate boolean not null,run_id uuid not null references processing_runs(id),created_at timestamptz not null default now(),unique(batch_id,original_path));
create table intake_reviews(id uuid primary key default gen_random_uuid(),deal_id uuid not null references deals(id),document_version_id uuid not null references document_versions(id),record_version_id uuid references record_versions(id),type text not null check(type in ('unreadable','segmentation','classification','party_assignment','version_conflict')),status text not null default 'open' check(status in ('open','resolved')),priority text not null default 'normal' check(priority in ('normal','high')),reason text not null,created_at timestamptz not null default now());
create unique index intake_review_open on intake_reviews(document_version_id,type) where status='open';
create index intake_batch_files on intake_files(batch_id);
create index intake_reviews_deal on intake_reviews(deal_id,status);
alter table parties drop constraint parties_kind_check;
alter table parties add constraint parties_kind_check check(kind in ('individual','entity','unknown'));
do $$ declare c record; begin for c in select conname from pg_constraint where conrelid='parties'::regclass and pg_get_constraintdef(oid) like '%cardinality(roles)%' loop execute format('alter table parties drop constraint %I',c.conname); end loop; end $$;
alter table parties add constraint parties_roles_check check(cardinality(roles)>0 and roles <@ array['buyer_owner','guarantor','buyer_entity','seller_entity','seller_owner','affiliate','donor','investor','landlord','cpa','attorney','broker','lender_contact','unknown']);
alter table ownership_links drop constraint ownership_links_stage_check;
alter table ownership_links add constraint ownership_links_stage_check check(stage in ('pre_closing','post_closing','unknown'));
alter table ownership_links drop constraint ownership_links_origin_check;
alter table ownership_links add constraint ownership_links_origin_check check(origin in ('declared','extracted','unknown'));
alter table document_versions drop constraint document_versions_mime_type_check;
alter table document_versions add constraint document_versions_mime_type_check check(mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream'));
