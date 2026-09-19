-- Phase 1: additive domain core. Legacy extraction tables remain unchanged.
create table deals (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces(id),
 code text not null, name text not null,
 status text not null default 'intake' check(status in ('intake','in_progress','ready_for_lender','closed','archived')),
 profile_json jsonb not null check(jsonb_typeof(profile_json)='object'),
 rule_pack_version text not null, overlay_id text, as_of_date date not null,
 target_submission_date date, expected_loan_number_date date,
 created_at timestamptz not null default now(), unique(workspace_id,code), unique(id,workspace_id)
);
create table parties (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references deals(id),
 kind text not null check(kind in ('individual','entity')), roles text[] not null,
 legal_name text not null, name_variants jsonb not null default '[]',
 identifier_hmac text check(identifier_hmac ~ '^[a-f0-9]{64}$'), identifier_last_four text check(identifier_last_four ~ '^[0-9]{4}$'),
 jointly_held_assets text not null default 'unknown' check(jointly_held_assets in ('yes','no','unknown')),
 affiliates jsonb not null default '"unknown"', created_at timestamptz not null default now(), unique(id,deal_id),
 check((identifier_hmac is null)=(identifier_last_four is null)),
 check(cardinality(roles)>0 and roles <@ array['buyer_owner','guarantor','buyer_entity','seller_entity','seller_owner','affiliate','donor','investor','landlord','cpa','attorney','broker','lender_contact'])
);
create table ownership_links (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references deals(id),
 owner_party_id uuid not null, owned_party_id uuid not null, percent numeric(7,4) check(percent between 0 and 100),
 stage text not null check(stage in ('pre_closing','post_closing')), origin text not null check(origin in ('declared','extracted')),
 created_at timestamptz not null default now(), check(owner_party_id<>owned_party_id),
 foreign key(owner_party_id,deal_id) references parties(id,deal_id), foreign key(owned_party_id,deal_id) references parties(id,deal_id),
 unique(deal_id,owner_party_id,owned_party_id,stage)
);
alter table documents add column deal_id uuid;
alter table documents add constraint documents_deal_workspace_fk foreign key(deal_id,workspace_id) references deals(id,workspace_id);
create index documents_deal_idx on documents(deal_id);
create table segments (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references deals(id), document_version_id uuid not null references document_versions(id),
 metadata_locator jsonb not null, page_start integer not null check(page_start>0), page_end integer not null check(page_end>=page_start), doc_type text not null,
 party_id uuid, period text, form_revision text, signed boolean, dated boolean, signature_date date, document_date date,
 expected_page_count integer check(expected_page_count>0), account_last_four text check(account_last_four ~ '^[0-9]{4}$'),
 classification_method text not null check(classification_method in ('signature','llm','manual')),
 classification_confidence numeric(5,4) not null check(classification_confidence between 0 and 1),
 status text not null check(status in ('proposed','confirmed','rejected')), is_current boolean not null default true,
 created_at timestamptz not null default now(), foreign key(party_id,deal_id) references parties(id,deal_id), unique(id,deal_id)
);
-- Ownership of a legacy version comes through its document; no duplicated deal id.
create function check_segment_deal() returns trigger language plpgsql as $$
begin
 if not exists(select 1 from document_versions v join documents d on d.id=v.document_id where v.id=new.document_version_id and d.deal_id=new.deal_id) then
  raise exception 'Segment document belongs to another deal';
 end if; return new;
end $$;
create trigger segments_deal_guard before insert or update on segments for each row execute function check_segment_deal();
create table events (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references deals(id), actor_id uuid not null references app_users(id),
 action text not null, entity_type text not null, entity_id uuid not null,
 masked_before jsonb, masked_after jsonb, created_at timestamptz not null default now(), unique(id,deal_id)
);
create table facts (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references deals(id), segment_id uuid not null,
 subject_party_id uuid, attribute text not null, value_json jsonb not null, normalized_value_json jsonb not null, unit text not null, period text,
 method text not null check(method in ('acroform','text','vision','manual','declared')), locator_json jsonb not null,
 confidence numeric(5,4) not null check(confidence between 0 and 1), confidence_components jsonb not null,
 validators_passed boolean not null, routing_status text not null check(routing_status in ('auto_accepted','accepted','review','blocked','rejected','needs_source')),
 actor_id uuid references app_users(id), audit_event_id uuid, record_version integer not null check(record_version>0), is_current boolean not null default true,
 created_at timestamptz not null default now(), foreign key(segment_id,deal_id) references segments(id,deal_id),
 foreign key(subject_party_id,deal_id) references parties(id,deal_id), foreign key(audit_event_id,deal_id) references events(id,deal_id),
 check(method<>'manual' or (actor_id is not null and audit_event_id is not null and validators_passed)),
 check(locator_json ?& array['file','page','source_block','quote']),
 check(attribute not in ('party.identifier','bank.account') or (
   jsonb_typeof(value_json)='object' and value_json ?& array['hmac','last_four'] and normalized_value_json ?& array['hmac','last_four'] and value_json->>'hmac' ~ '^[a-f0-9]{64}$' and value_json->>'last_four' ~ '^[0-9]{4}$'
   and (value_json - 'hmac' - 'last_four')='{}'::jsonb and
   normalized_value_json->>'hmac' ~ '^[a-f0-9]{64}$' and normalized_value_json->>'last_four' ~ '^[0-9]{4}$'
   and (normalized_value_json - 'hmac' - 'last_four')='{}'::jsonb))
);
create table rule_pack_snapshots (
 id uuid primary key default gen_random_uuid(), pack text not null, version text not null, overlay_id text,
 content_hash text not null unique check(content_hash ~ '^[a-f0-9]{64}$'), canonical_json jsonb not null, resolved_yaml text not null,
 created_at timestamptz not null default now()
);
create table evaluations (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references deals(id),
 rule_pack_hash text not null references rule_pack_snapshots(content_hash), facts_hash text not null check(facts_hash ~ '^[a-f0-9]{64}$'),
 result_hash text not null check(result_hash ~ '^[a-f0-9]{64}$'), duration_ms integer not null check(duration_ms>=0), as_of_date date not null,
 created_at timestamptz not null default now(), unique(id,deal_id)
);
create table checklist_status (
 id uuid primary key default gen_random_uuid(), evaluation_id uuid not null references evaluations(id),
 item_id text not null, scope_key text not null, period text not null default '',
 status text not null check(status in ('satisfied','received_with_issues','missing','needs_review','not_applicable','waived','tracking')),
 satisfying_segment_ids uuid[] not null default '{}', reasons_json jsonb not null,
 unique(evaluation_id,item_id,scope_key,period)
);
create table findings (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references deals(id), finding_key text not null,
 rule_id text not null, type text not null check(type in ('missing','stale','incomplete','conflict','needs_review','info')),
 severity text not null check(severity in ('blocker','major','minor','info')), scope_key text not null, period text, details_json jsonb not null,
 status text not null default 'open' check(status in ('open','requested','received','resolved','dismissed','waived')), responsible_role text not null,
 first_seen_evaluation_id uuid not null, last_seen_evaluation_id uuid not null, resolution_note text, resolver_id uuid references app_users(id),
 created_at timestamptz not null default now(), unique(deal_id,finding_key),
 foreign key(first_seen_evaluation_id,deal_id) references evaluations(id,deal_id), foreign key(last_seen_evaluation_id,deal_id) references evaluations(id,deal_id)
);
create function reject_domain_mutation() returns trigger language plpgsql as $$ begin raise exception 'Immutable domain record'; end $$;
create trigger events_immutable before update or delete on events for each row execute function reject_domain_mutation();
create trigger rule_pack_snapshots_immutable before update or delete on rule_pack_snapshots for each row execute function reject_domain_mutation();
create index parties_deal_idx on parties(deal_id);
create index ownership_deal_idx on ownership_links(deal_id);
create index segments_lookup_idx on segments(deal_id,party_id,doc_type,period) where is_current;
create index facts_lookup_idx on facts(deal_id,subject_party_id,attribute,period) where is_current;
create index events_deal_idx on events(deal_id,created_at);
create index evaluations_deal_idx on evaluations(deal_id,created_at);
create index findings_deal_status_idx on findings(deal_id,status);

alter table segments add constraint segment_taxonomy check(doc_type in ('SBA_1919','SBA_413','TAX_PERSONAL','TAX_BUSINESS','FIN_YEAR_END','FIN_INTERIM','AGING_AR','AGING_AP','DEBT_SCHEDULE','LOI','PURCHASE_AGREEMENT','SOURCES_USES','SELLER_NOTE','BANK_STATEMENT','GIFT_LETTER','LEASE','OPERATING_AGREEMENT','EIN_LETTER','GOV_ID','CITIZENSHIP_EVIDENCE','IRS_4506C','SBA_159','CONSULTING_AGREEMENT','VALUATION','QOE','RESUME','CREDIT_AUTH','FORMATION_DOC','GOOD_STANDING','OWNERSHIP_CHART','BUSINESS_PLAN','PROJECTIONS','ADDBACK_SCHEDULE','EQUIPMENT_LIST','LICENSE','FRANCHISE_AGREEMENT','CIM','ESCROW_EVIDENCE','NON_COMPETE','RE_CONTRACT','OTHER_NOT_REQUIRED','UNREADABLE','SBA_155','TRANSFER_EVIDENCE','FRANCHISE_DISCLOSURE','LEASE_CONSENT','INVENTORY_SUMMARY','KEY_CONTRACT','EMPLOYEE_ROSTER','TAX_EXTENSION','APPRAISAL','ENVIRONMENTAL'));
alter table facts add constraint fact_catalog check(attribute in ('party.legal_name','party.identifier','party.address','party.dba','party.entity_type','ownership.members','deal.purchase_price','deal.seller_note_amount','deal.loan_requested','deal.structure','deal.buyer','deal.seller','deal.seller_note_terms','deal.expiry_date','deal.outside_date','deal.allocation_present','deal.signed_by_both','deal.executed','funding.sources','funding.sources_total','funding.uses','funding.uses_total','pfs.cash','pfs.total_assets','pfs.total_liabilities','pfs.net_worth','pfs.as_of_date','pfs.spouse_signed','tax.year','tax.page_count','tax.form_type','tax.gross_receipts','tax.net_income','tax.officer_compensation','tax.depreciation','tax.interest_expense','financial.revenue','financial.net_income','financial.total_assets','financial.total_liabilities','financial.period_start','financial.period_end','aging.as_of_date','aging.total','debt.as_of_date','debt.total','debt.debts','note.principal','note.rate','note.term_months','note.full_standby','bank.account','bank.institution','bank.period_end','bank.ending_balance','gift.donor','gift.recipient','gift.amount','gift.no_repayment','lease.landlord','lease.tenant','lease.commencement','lease.expiry','lease.option_years','lease.assignment_present','id.expiry','citizenship.evidence_kind','irs.years_requested','agent.agent','agent.services','agent.payer','agent.amount','agent.both_signed','consulting.party','consulting.term_months','report.preparer','report.credential','report.date','report.concluded_value'));
-- A document with classified segments cannot silently move those segments to a new deal.
create function guard_document_deal_change() returns trigger language plpgsql as $$
begin
 if old.deal_id is distinct from new.deal_id and exists(select 1 from document_versions v join segments s on s.document_version_id=v.id where v.document_id=old.id) then
  raise exception 'Cannot reassign a document with domain segments';
 end if; return new;
end $$;
create trigger documents_deal_change_guard before update of deal_id on documents for each row execute function guard_document_deal_change();
