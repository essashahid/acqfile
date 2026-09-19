-- requires: supabase
-- No direct API write surface for the new domain core. Server adapters enforce roles.
do $$ declare t text; begin
 foreach t in array array['deals','parties','ownership_links','segments','facts','events','rule_pack_snapshots','evaluations','checklist_status','findings'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from anon, authenticated',t);
 end loop;
end $$;
