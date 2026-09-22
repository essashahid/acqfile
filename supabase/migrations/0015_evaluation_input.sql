-- Old evaluations have no freshness proof and must be evaluated again.
alter table evaluations add column input_hash text;
