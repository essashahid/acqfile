-- requires: supabase
alter table deal_batches enable row level security;
alter table intake_files enable row level security;
alter table intake_reviews enable row level security;
revoke all on deal_batches,intake_files,intake_reviews from anon,authenticated;
