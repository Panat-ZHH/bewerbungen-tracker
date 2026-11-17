-- Access model, part 1: the core (branch acc-backend, 2026-11-18). Contract: docs/access/SPEC.md §1, §3, §7; docs/access/DB.md.
-- Run AFTER every 20261117* migration. ADDITIVE ONLY and idempotent (create if not exists / create or replace / on conflict).
--
-- What this adds:
--  * public.access_settings      single row (id = 1). enforce_mode 'off' | 'test_users' | 'on'. DEFAULT 'test_users':
--                                Netlify previews share the LIVE database, so after this migration nothing changes for real users
--                                until public.access_go_live() is run (docs/access/GO-LIVE.md).
--  * public.account_access       one row per user (trigger on auth.users insert + backfill): 7-day trial, admin grant, block,
--                                enforce_test (throwaway e2e users only).
--  * public.trial_ledger         sha256(lower(trim(email))) → first trial end. Survives account deletion, so a re-signup with the
--                                same e-mail gets NO new trial.
--  * public.platform_admins, public.am_i_platform_admin(), public.admin_audit_log (append-only).
--  * public.school_teachers + school_add_teacher / school_remove_teacher (school admins link teachers to their school).
--  * billing_customers.user_id / billing_subscriptions.user_id + plan 'solo' (owner = one user). The webhook function for solo
--    lives in 20261118030000_billing_solo.sql.
--  * public.app_access(uid) / my_access() / has_app_access(uid) / _assert_app_access() – THE decision (shape = AccessInfo in
--    lib/access/types.ts; pure TS mirror in lib/access/core.ts, keep both in sync).
--  * public.access_go_live() – service role only.
-- The paywall itself (restrictive RLS + guarded RPCs) is 20261118020000_access_guards.sql.
--
-- Decision order (app_access), first match wins:
--   blocked (unless mode 'off') → grant → school licence → own solo subscription → family subscription / admin family plan
--   → payment grace (past_due) → teacher / school admin without licence: licence_required → 7-day trial → expired.
-- has_access is ALWAYS true when enforcement does not apply to the user (enforced = false).

-- ---------------------------------------------------------------- 1. settings
create table if not exists public.access_settings (
  id integer primary key default 1 check (id = 1),
  enforce_mode text not null default 'test_users' check (enforce_mode in ('off', 'test_users', 'on')),
  went_live_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.access_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------- 2. tables
create table if not exists public.account_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trial_started_at timestamptz not null,
  trial_ends_at timestamptz not null,
  free_access_until timestamptz,
  free_access_note text check (free_access_note is null or length(free_access_note) <= 500),
  blocked_at timestamptz,
  blocked_reason text check (blocked_reason is null or length(blocked_reason) <= 500),
  enforce_test boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists account_access_trial_idx on public.account_access (trial_ends_at);

create table if not exists public.trial_ledger (
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  first_trial_ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  note text check (note is null or length(note) <= 500)
);

-- No FK on admin_id / target_user: the log must survive the deletion of the admin or the target account.
create table if not exists public.admin_audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  admin_id uuid,
  action text not null check (length(action) between 1 and 100),
  target_user uuid,
  target_school uuid,
  details jsonb not null default '{}'::jsonb,
  ip text check (ip is null or length(ip) <= 64)
);
create index if not exists admin_audit_log_at_idx on public.admin_audit_log (at desc);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_user, at desc) where target_user is not null;

create table if not exists public.school_teachers (
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (school_id, user_id)
);
create index if not exists school_teachers_user_idx on public.school_teachers (user_id);

-- ---------------------------------------------------------------- 3. billing: solo plan owner = one user
alter table public.billing_customers add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.billing_subscriptions add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists billing_customers_user_idx on public.billing_customers (user_id, created_at desc) where user_id is not null;
create index if not exists billing_subscriptions_user_idx on public.billing_subscriptions (user_id, updated_at desc) where user_id is not null;
alter table public.billing_customers drop constraint if exists billing_customers_owner_check;
alter table public.billing_customers add constraint billing_customers_owner_check check (num_nonnulls(school_id, family_id, user_id) = 1);
alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_owner_check;
alter table public.billing_subscriptions add constraint billing_subscriptions_owner_check check (num_nonnulls(school_id, family_id, user_id) = 1);
alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_plan_owner_check;
alter table public.billing_subscriptions add constraint billing_subscriptions_plan_owner_check check (
  (plan_id = 'family') = (family_id is not null) and (plan_id = 'solo') = (user_id is not null));
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.billing_subscriptions'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%plan_id%starter%' loop
    execute format('alter table public.billing_subscriptions drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.billing_subscriptions add constraint billing_subscriptions_plan_id_check
  check (plan_id in ('starter', 'professional', 'enterprise', 'individual', 'family', 'solo'));

-- ---------------------------------------------------------------- 4. RLS + grants
alter table public.access_settings enable row level security;
alter table public.account_access enable row level security;
alter table public.trial_ledger enable row level security;
alter table public.platform_admins enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.school_teachers enable row level security;
revoke all on public.access_settings, public.account_access, public.trial_ledger, public.platform_admins,
  public.admin_audit_log, public.school_teachers from public, anon, authenticated;
revoke all on sequence public.admin_audit_log_id_seq from public, anon, authenticated;
-- Authenticated: own access row, school_teachers of own school / own rows. Never a write.
grant select on public.account_access, public.school_teachers to authenticated;
drop policy if exists "own access row" on public.account_access;
create policy "own access row" on public.account_access for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "school teachers visible to school admins and self" on public.school_teachers;
create policy "school teachers visible to school admins and self" on public.school_teachers for select to authenticated
  using (user_id = (select auth.uid()) or public.is_school_admin(school_id));
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.access_settings, public.account_access, public.trial_ledger,
      public.platform_admins, public.school_teachers to service_role;
    grant select, insert on public.admin_audit_log to service_role;
    grant usage, select on sequence public.admin_audit_log_id_seq to service_role;
  end if;
end $$;

-- Append-only audit log: UPDATE / DELETE / TRUNCATE are refused for everyone except service_role.
create or replace function public._admin_audit_log_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'service_role' then return case when tg_op = 'DELETE' then old else new end; end if;
  raise exception 'AUDIT_LOG_APPEND_ONLY';
end;
$$;
revoke all on function public._admin_audit_log_append_only() from public, anon, authenticated;
drop trigger if exists admin_audit_log_append_only on public.admin_audit_log;
create trigger admin_audit_log_append_only before update or delete on public.admin_audit_log
  for each row execute function public._admin_audit_log_append_only();
drop trigger if exists admin_audit_log_no_truncate on public.admin_audit_log;
create trigger admin_audit_log_no_truncate before truncate on public.admin_audit_log
  for each statement execute function public._admin_audit_log_append_only();

-- ---------------------------------------------------------------- 5. signup: trial row (+ ledger) and server-side account type
create or replace function public._access_email_hash(p_email text)
returns text language sql immutable set search_path = '' as $$
  select case when nullif(btrim(coalesce(p_email, '')), '') is null then null
    else encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex') end;
$$;
revoke all on function public._access_email_hash(text) from public, anon, authenticated;

-- Creates the account_access row of p_uid if missing. p_start = signup time; p_min_end = earliest trial end (backfill).
-- The ledger keeps the FIRST trial end per e-mail: a new account with a known e-mail inherits it (usually already over).
create or replace function public._access_ensure(p_uid uuid, p_email text, p_start timestamptz, p_min_end timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_hash text := public._access_email_hash(p_email); v_end timestamptz; v_first timestamptz;
begin
  if p_uid is null or exists (select 1 from public.account_access a where a.user_id = p_uid) then return; end if;
  v_end := greatest(coalesce(p_start, now()) + interval '7 days', coalesce(p_min_end, '-infinity'::timestamptz));
  if v_hash is not null then
    insert into public.trial_ledger (email_hash, first_trial_ends_at) values (v_hash, v_end) on conflict (email_hash) do nothing;
    select l.first_trial_ends_at into v_first from public.trial_ledger l where l.email_hash = v_hash;
    v_end := least(v_end, coalesce(v_first, v_end));
  end if;
  insert into public.account_access (user_id, trial_started_at, trial_ends_at)
  values (p_uid, coalesce(p_start, now()), v_end) on conflict (user_id) do nothing;
end;
$$;
revoke all on function public._access_ensure(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;

-- auth.users insert: trial row + account type from the signup metadata (parent / independent_student, birth year), stored
-- server-side so the client no longer has to sync it (account_set_type stays as it is for later changes).
-- to_jsonb(new): the created_at column is read dynamically (test stubs of auth.users may not have it).
create or replace function public._access_after_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); v_type text; v_year integer; v_start timestamptz;
begin
  v_start := coalesce((to_jsonb(new) ->> 'created_at')::timestamptz, now());
  perform public._access_ensure(new.id, new.email, v_start);
  v_type := meta ->> 'account_type';
  if v_type in ('parent', 'independent_student') and coalesce(meta ->> 'role', 'student') <> 'teacher' then
    if v_type = 'independent_student' and coalesce(meta ->> 'birth_year', '') ~ '^[0-9]{4}$' then
      v_year := (meta ->> 'birth_year')::integer;
      if v_year not between extract(year from current_date)::integer - 100 and extract(year from current_date)::integer then v_year := null; end if;
    end if;
    insert into public.profiles (id, user_id, first_name, last_name, email, account_type, birth_year)
    values ('profile-' || new.id::text, new.id, '', '', coalesce(new.email, ''), v_type, v_year)
    on conflict do nothing;
  end if;
  return new;
exception when others then
  -- Never block a signup because of the access row: has_app_access treats a missing row as "trial from signup".
  raise warning 'access signup hook failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;
revoke all on function public._access_after_signup() from public, anon, authenticated;
drop trigger if exists access_after_signup on auth.users;
create trigger access_after_signup after insert on auth.users
  for each row execute function public._access_after_signup();

-- Backfill existing users: fresh trial = greatest(created_at + 7 days, now() + 7 days) (access_go_live re-bases it).
do $$ declare u record; begin
  for u in select a.id, a.email, (to_jsonb(a) ->> 'created_at')::timestamptz as created_at from auth.users a
    where not exists (select 1 from public.account_access x where x.user_id = a.id) loop
    perform public._access_ensure(u.id, u.email, coalesce(u.created_at, now()), now() + interval '7 days');
  end loop;
end $$;

-- ---------------------------------------------------------------- 6. the decision
-- Subscription state for access: 'active' (active/trialing, period not long over), 'grace' (past_due, 7 days from the start
-- of the unpaid period), else 'none'. Stripe moves current_period_* forward BEFORE the renewal is paid, so the grace is
-- counted from current_period_start (see docs/access/DB.md, CONTRACT CHANGE vs SPEC "current_period_end + 7 days").
create or replace function public._access_sub_grace_until(p_sub public.billing_subscriptions)
returns timestamptz language sql immutable set search_path = '' as $$
  select case when p_sub.status = 'past_due'
    then coalesce(least(p_sub.current_period_start, p_sub.current_period_end), p_sub.current_period_start, p_sub.current_period_end, p_sub.updated_at)
      + interval '7 days' end;
$$;
create or replace function public._access_sub_state(p_sub public.billing_subscriptions, p_now timestamptz default now())
returns text language sql stable set search_path = '' as $$
  select case
    when p_sub.id is null then 'none'
    when p_sub.status in ('active', 'trialing')
      and (p_sub.current_period_end is null or p_sub.current_period_end > p_now - interval '2 days') then 'active'
    when p_sub.status = 'past_due' and public._access_sub_grace_until(p_sub) > p_now then 'grace'
    else 'none' end;
$$;
revoke all on function public._access_sub_grace_until(public.billing_subscriptions) from public, anon, authenticated;
revoke all on function public._access_sub_state(public.billing_subscriptions, timestamptz) from public, anon, authenticated;

-- Valid licence (pilot/active today) of a school, or null.
create or replace function public._access_school_valid(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public._licence_state(l.status, l.pilot_end, l.valid_from, l.valid_until) in ('pilot', 'active')
    from public._school_current_licence(p_school_id) l where l.id is not null), false);
$$;
revoke all on function public._access_school_valid(uuid) from public, anon, authenticated;

-- The licensed school that gives p_uid access: as student (member of a not archived class of the school) or as staff
-- (school admin, school teacher, owner or co-teacher of a class of the school). Null when none.
create or replace function public._access_licensed_school(p_uid uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select x.school_id from (
    select c.school_id from public.class_members m join public.classes c on c.id = m.class_id
      where m.student_id = p_uid and c.school_id is not null and not coalesce(c.archived, false)
    union select a.school_id from public.school_admins a where a.user_id = p_uid
    union select t.school_id from public.school_teachers t where t.user_id = p_uid
    union select c.school_id from public.classes c where c.teacher_id = p_uid and c.school_id is not null and not coalesce(c.archived, false)
    union select c.school_id from public.class_teachers t join public.classes c on c.id = t.class_id
      where t.teacher_id = p_uid and c.school_id is not null and not coalesce(c.archived, false)
  ) x where public._access_school_valid(x.school_id)
  order by x.school_id limit 1;
$$;
revoke all on function public._access_licensed_school(uuid) from public, anon, authenticated;


-- AccessInfo (lib/access/types.ts) of p_uid. Internal: service role / definer callers only (my_access() for the user).
create or replace function public.app_access(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  now_ts timestamptz := now();
  mode text;
  aa public.account_access;
  v_urole text; v_role text; v_type text;
  v_school uuid; v_school_json jsonb; v_lic public.school_licences;
  solo public.billing_subscriptions; fam public.billing_subscriptions; shown public.billing_subscriptions;
  v_family uuid; v_fam_plan boolean := false;
  v_blocked boolean; v_enforced boolean; v_staff boolean;
  v_state text; v_reason text; v_trial_end timestamptz; v_grace timestamptz; v_grant timestamptz; v_real boolean;
  v_interval text;
begin
  if p_uid is null then return null; end if;
  select s.enforce_mode into mode from public.access_settings s where s.id = 1;
  mode := coalesce(mode, 'test_users');
  select * into aa from public.account_access a where a.user_id = p_uid;
  if aa.user_id is null then
    -- No row (signup hook failed, or a user created before the trigger existed): trial counted from the signup time.
    select p_uid, coalesce((to_jsonb(u) ->> 'created_at')::timestamptz, now_ts),
           coalesce((to_jsonb(u) ->> 'created_at')::timestamptz, now_ts) + interval '7 days', false
      into aa.user_id, aa.trial_started_at, aa.trial_ends_at, aa.enforce_test
      from auth.users u where u.id = p_uid;
    if aa.user_id is null then return null; end if;
  end if;

  -- Role: teacher / school admin by user_roles (+ school_admins rows), else parent / student by profiles.account_type.
  select r.role into v_urole from public.user_roles r where r.user_id = p_uid;
  v_type := public._account_type(p_uid);
  v_role := case
    when v_urole = 'teacher' then 'teacher'
    when v_urole = 'school_admin' then 'school_admin'
    when v_type = 'parent' then 'parent'
    when exists (select 1 from public.school_admins a where a.user_id = p_uid)
      and not exists (select 1 from public.class_members m where m.student_id = p_uid) then 'school_admin'
    else 'student' end;
  v_staff := v_role in ('teacher', 'school_admin');
  if v_staff then v_type := null; end if;

  v_blocked := aa.blocked_at is not null;
  v_enforced := mode = 'on' or (mode = 'test_users' and coalesce(aa.enforce_test, false)) or (v_blocked and mode <> 'off');
  v_grant := case when aa.free_access_until > now_ts then aa.free_access_until end;

  v_school := public._access_licensed_school(p_uid);
  if v_school is not null then
    v_lic := public._school_current_licence(v_school);
    select jsonb_build_object('id', s.id, 'name', s.name,
      'valid_until', case when v_lic.status = 'pilot' then v_lic.pilot_end else v_lic.valid_until end)
      into v_school_json from public.schools s where s.id = v_school;
  end if;

  select * into solo from public.billing_subscriptions s where s.user_id = p_uid and s.plan_id = 'solo'
    order by (public._access_sub_state(s, now_ts) = 'active') desc, (public._access_sub_state(s, now_ts) = 'grace') desc,
      s.updated_at desc, s.id limit 1;

  select m.family_id into v_family from public.family_members m where m.user_id = p_uid and m.status = 'active' limit 1;
  if v_family is not null then
    select * into fam from public.billing_subscriptions s where s.family_id = v_family
      order by (public._access_sub_state(s, now_ts) = 'active') desc, (public._access_sub_state(s, now_ts) = 'grace') desc,
        s.updated_at desc, s.id limit 1;
    -- Admin-assigned family plan (pilot / active). The old 30-day family 'trial' row does NOT grant access any more.
    v_fam_plan := exists (select 1 from public.school_licences l where l.family_id = v_family
      and coalesce(l.source, 'manual') <> 'stripe' and l.status in ('pilot', 'active')
      and public._family_plan_state(l) in ('pilot', 'active'));
  end if;

  if v_blocked and mode <> 'off' then v_state := 'blocked'; v_reason := 'none';
  elsif v_grant is not null then v_state := 'active'; v_reason := 'grant';
  elsif v_school is not null then v_state := 'active'; v_reason := 'school_licence';
  elsif public._access_sub_state(solo, now_ts) = 'active' then v_state := 'active'; v_reason := 'subscription';
  elsif public._access_sub_state(fam, now_ts) = 'active' or v_fam_plan then v_state := 'active'; v_reason := 'family_subscription';
  elsif public._access_sub_state(solo, now_ts) = 'grace' then
    v_state := 'grace'; v_reason := 'grace'; v_grace := public._access_sub_grace_until(solo);
  elsif public._access_sub_state(fam, now_ts) = 'grace' then
    v_state := 'grace'; v_reason := 'grace'; v_grace := public._access_sub_grace_until(fam);
  elsif v_staff then v_state := 'licence_required'; v_reason := 'none';
  elsif aa.trial_ends_at > now_ts then v_state := 'trial'; v_reason := 'trial';
  else v_state := 'expired'; v_reason := 'none';
  end if;
  v_real := v_state in ('active', 'trial', 'grace');

  -- No trial for teachers / school admins and for school-licensed users.
  v_trial_end := case when v_staff or v_reason = 'school_licence' then null else aa.trial_ends_at end;
  shown := case when solo.id is not null then solo else fam end;
  if shown.id is not null then
    v_interval := case public._billing_interval_from_period(shown.current_period_start, shown.current_period_end)
      when 'monthly' then 'month' when 'yearly' then 'year' end;
  end if;

  return jsonb_build_object(
    'has_access', case when v_enforced then v_real else true end,
    'state', v_state,
    'reason', v_reason,
    'role', v_role,
    'account_type', v_type,
    'trial_ends_at', v_trial_end,
    'trial_days_left', case when v_trial_end is null then null
      else greatest(0, ceil(extract(epoch from (v_trial_end - now_ts)) / 86400.0))::integer end,
    'grace_until', v_grace,
    'grant_until', v_grant,
    'subscription', case when shown.id is null then null else jsonb_build_object(
      'plan', case when shown.plan_id = 'solo' then 'solo' else 'family' end,
      'status', shown.status, 'interval', v_interval, 'current_period_end', shown.current_period_end,
      'cancel_at_period_end', shown.cancel_at_period_end) end,
    'school', v_school_json,
    'blocked', v_blocked,
    'enforced', v_enforced);
end;
$$;
revoke all on function public.app_access(uuid) from public, anon, authenticated;

create or replace function public.my_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.app_access(auth.uid());
$$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- THE gate. True for the service role / SQL (uid null) and whenever enforcement does not apply to the user.
-- A signed-in user may only ask about themselves (FORBIDDEN otherwise).
create or replace function public.has_app_access(p_uid uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare mode text; aa public.account_access;
begin
  if p_uid is null then return true; end if;
  if current_setting('role', true) in ('authenticated', 'anon') and p_uid is distinct from auth.uid() then
    raise exception 'FORBIDDEN';
  end if;
  select s.enforce_mode into mode from public.access_settings s where s.id = 1;
  mode := coalesce(mode, 'test_users');
  if mode = 'off' then return true; end if;
  select * into aa from public.account_access a where a.user_id = p_uid;
  if mode = 'test_users' and not coalesce(aa.enforce_test, false) and aa.blocked_at is null then return true; end if;
  return coalesce((public.app_access(p_uid) ->> 'has_access')::boolean, true);
end;
$$;
revoke all on function public.has_app_access(uuid) from public, anon;
grant execute on function public.has_app_access(uuid) to authenticated;

-- Called first by every security-definer RPC that creates or changes user content (20261118020000_access_guards.sql).
create or replace function public._assert_app_access()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_app_access(auth.uid()) then
    raise exception 'PAYWALL' using errcode = 'P0001', detail = 'Dein Zugang ist abgelaufen. Wähle ein Abo, um weiterzumachen.';
  end if;
end;
$$;
revoke all on function public._assert_app_access() from public, anon;
grant execute on function public._assert_app_access() to authenticated;

create or replace function public.am_i_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.platform_admins p where p.user_id = auth.uid());
$$;
revoke all on function public.am_i_platform_admin() from public, anon;
grant execute on function public.am_i_platform_admin() to authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.app_access(uuid), public.my_access(), public.has_app_access(uuid),
      public._assert_app_access(), public.am_i_platform_admin() to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------- 7. school teachers (school admins link teachers)
create or replace function public.school_add_teacher(p_school_id uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_user uuid;
begin
  if uid is not null then
    if not public.is_school_admin(p_school_id) then raise exception 'FORBIDDEN'; end if;
    perform public._rl_enforce('school-teacher', 30, 300, 3600); -- e-mail lookups (enumeration)
  end if;
  if not exists (select 1 from public.schools s where s.id = p_school_id) then raise exception 'NOT_FOUND'; end if;
  if nullif(btrim(coalesce(p_email, '')), '') is null or length(p_email) > 254 then raise exception 'INVALID_REQUEST'; end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_user is null then
    raise exception 'USER_NOT_FOUND' using detail = 'Zu dieser E-Mail gibt es noch kein WendApply-Konto. Die Lehrperson muss sich zuerst registrieren.';
  end if;
  if exists (select 1 from public.class_members m where m.student_id = v_user)
    or exists (select 1 from public.profiles p where p.user_id = v_user and p.account_type = 'parent') then
    raise exception 'NOT_A_TEACHER' using detail = 'Dieses Konto ist ein Schüler- oder Elternkonto.';
  end if;
  insert into public.school_teachers (school_id, user_id, added_by) values (p_school_id, v_user, uid) on conflict do nothing;
  return jsonb_build_object('school_id', p_school_id, 'user_id', v_user);
end;
$$;
revoke all on function public.school_add_teacher(uuid, text) from public, anon;
grant execute on function public.school_add_teacher(uuid, text) to authenticated;

create or replace function public.school_remove_teacher(p_school_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_school_admin(p_school_id) then raise exception 'FORBIDDEN'; end if;
  delete from public.school_teachers t where t.school_id = p_school_id and t.user_id = p_user_id;
end;
$$;
revoke all on function public.school_remove_teacher(uuid, uuid) from public, anon;
grant execute on function public.school_remove_teacher(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- 8. go-live (service role only, idempotent)
create or replace function public.access_go_live()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_live timestamptz; n integer;
begin
  if auth.uid() is not null then raise exception 'FORBIDDEN'; end if;
  update public.access_settings s set went_live_at = coalesce(s.went_live_at, now()), enforce_mode = 'on', updated_at = now()
    where s.id = 1 returning s.went_live_at into v_live;
  if v_live is null then
    insert into public.access_settings (id, enforce_mode, went_live_at) values (1, 'on', now()) returning went_live_at into v_live;
  end if;
  -- Users without a row (should not exist) get one first.
  perform public._access_ensure(u.id, u.email, coalesce((to_jsonb(u) ->> 'created_at')::timestamptz, now()), v_live + interval '7 days')
    from auth.users u where not exists (select 1 from public.account_access a where a.user_id = u.id);
  -- Everybody who signed up before the go-live: 7 days from the go-live (never shortened).
  update public.account_access a set trial_ends_at = v_live + interval '7 days', updated_at = now()
    where a.trial_started_at < v_live and a.trial_ends_at < v_live + interval '7 days';
  get diagnostics n = row_count;
  insert into public.admin_audit_log (admin_id, action, details)
    values (null, 'access_go_live', jsonb_build_object('went_live_at', v_live, 'trials_rebased', n));
  return jsonb_build_object('enforce_mode', 'on', 'went_live_at', v_live, 'trials_rebased', n);
end;
$$;
revoke all on function public.access_go_live() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.access_go_live(), public.school_add_teacher(uuid, text), public.school_remove_teacher(uuid, uuid)
      to service_role;
  end if;
end $$;
