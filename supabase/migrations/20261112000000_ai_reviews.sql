-- AI application review ("Bewerbungs-Check"), see docs/ai-review/BRIEF.md.
-- Only the review RESULT is stored – never the uploaded file or its extracted text.
-- Rows are written exclusively by the edge function `ai-review` with the service role key;
-- signed-in users may only read (and delete) their own rows.
-- Additive and idempotent: safe to run twice, touches no existing table.

create table if not exists public.ai_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  file_name text check (file_name is null or length(file_name) <= 255),
  company text check (company is null or length(company) <= 200),
  beruf text check (beruf is null or length(beruf) <= 200),
  score integer not null check (score between 0 and 100),
  result jsonb not null,
  model text not null,
  prompt_version text not null
);
create index if not exists ai_reviews_user_created_idx on public.ai_reviews (user_id, created_at desc);

alter table public.ai_reviews enable row level security;
drop policy if exists "ai_reviews select own" on public.ai_reviews;
create policy "ai_reviews select own" on public.ai_reviews
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "ai_reviews delete own" on public.ai_reviews;
create policy "ai_reviews delete own" on public.ai_reviews
  for delete to authenticated using (user_id = auth.uid());

-- Optional per-user settings. daily_limit null = no limit (default). Only admins set daily_limit (SQL / service role);
-- consent_at is written by the edge function when the user agrees to the AI processing.
create table if not exists public.ai_review_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_limit integer check (daily_limit is null or daily_limit >= 0),
  consent_at timestamptz
);

alter table public.ai_review_user_settings enable row level security;
drop policy if exists "ai_review_user_settings select own" on public.ai_review_user_settings;
create policy "ai_review_user_settings select own" on public.ai_review_user_settings
  for select to authenticated using (user_id = auth.uid());

-- Privileges: users read (and delete their own reviews); writes only through the service role.
revoke all on table public.ai_reviews from anon;
revoke all on table public.ai_review_user_settings from anon;
revoke insert, update, truncate, references, trigger on table public.ai_reviews from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.ai_review_user_settings from authenticated;
grant select, delete on table public.ai_reviews to authenticated;
grant select on table public.ai_review_user_settings to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on table public.ai_reviews to service_role;
    grant all on table public.ai_review_user_settings to service_role;
  end if;
end $$;
