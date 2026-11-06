-- Reminders (item 15, 37): per-user settings, push subscriptions, revocable calendar feeds, send log.

create table if not exists public.reminder_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  in_app boolean not null default true,
  email boolean not null default false,
  push boolean not null default false,
  days_before integer not null default 3 check (days_before between 0 and 30),
  stale_days integer not null default 14 check (stale_days between 3 and 90),
  updated_at timestamptz not null default now()
);
alter table public.reminder_settings enable row level security;
drop policy if exists "reminder_settings own" on public.reminder_settings;
create policy "reminder_settings own" on public.reminder_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions own" on public.push_subscriptions;
create policy "push_subscriptions own" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- application_id null = one feed with all deadlines of the user; otherwise a feed for a single application.
create table if not exists public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id text,
  token text not null unique check (length(token) >= 32),
  created_at timestamptz not null default now()
);
create index if not exists calendar_feeds_user_idx on public.calendar_feeds (user_id);
alter table public.calendar_feeds enable row level security;
drop policy if exists "calendar_feeds own" on public.calendar_feeds;
create policy "calendar_feeds own" on public.calendar_feeds
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Dedupe log for sent reminders. Only the service role (server) touches it: RLS on, no policies.
create table if not exists public.reminder_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id text not null,
  kind text not null check (kind in ('deadline', 'stale')),
  due_on date not null,
  channel text not null check (channel in ('email', 'push')),
  sent_at timestamptz not null default now(),
  primary key (user_id, application_id, kind, due_on, channel)
);
alter table public.reminder_log enable row level security;

-- The public feed route (/api/ics/feed/<token>) reads through the service role; the secret token is the credential.
