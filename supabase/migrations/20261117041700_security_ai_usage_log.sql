-- Security audit 2026-11-17: the AI review daily limit could be bypassed.
-- The edge function counted public.ai_reviews rows of the last 24 h, but users may delete their own reviews (privacy),
-- so "check, delete, check again" gave unlimited (paid) Anthropic calls. Fix: an append-only usage log that users
-- can neither read nor change. A trigger fills it on every ai_reviews insert (also from an older, not yet redeployed
-- edge function); the new edge function counts this log instead of ai_reviews.
-- Only user id + timestamp + review id are stored (no content). Rows go with the account (on delete cascade).
-- Additive and idempotent.

create table if not exists public.ai_review_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists ai_review_usage_user_created_idx on public.ai_review_usage (user_id, created_at desc);
create unique index if not exists ai_review_usage_review_uidx on public.ai_review_usage (review_id) where review_id is not null;

alter table public.ai_review_usage enable row level security;
-- No policies on purpose: only the service role (edge function) reads it.
revoke all on table public.ai_review_usage from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on table public.ai_review_usage to service_role;
  end if;
end $$;

create or replace function public._ai_review_log_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ai_review_usage (user_id, review_id, created_at)
  values (new.user_id, new.id, coalesce(new.created_at, now()))
  on conflict do nothing;
  return new;
end;
$$;
revoke execute on function public._ai_review_log_usage() from public, anon, authenticated;

drop trigger if exists ai_reviews_log_usage on public.ai_reviews;
create trigger ai_reviews_log_usage after insert on public.ai_reviews
  for each row execute function public._ai_review_log_usage();

-- Backfill the current 24 h window so the limit holds right after the migration.
insert into public.ai_review_usage (user_id, review_id, created_at)
select r.user_id, r.id, r.created_at from public.ai_reviews r
where r.created_at > now() - interval '2 days'
on conflict do nothing;

-- Hygiene from the same audit: reminder_log has RLS without policies (= invisible), drop the unused table grants too.
revoke all on table public.reminder_log from anon, authenticated;
