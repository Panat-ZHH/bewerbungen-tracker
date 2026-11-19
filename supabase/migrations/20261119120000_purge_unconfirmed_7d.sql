-- Daily automatic purge of UNCONFIRMED sign-ups older than 7 days that have NO real data (Panat, 2026-11-19).
-- ADDITIVE ONLY, idempotent. Runs after 20261119110000. Spec: SPEC-DATA §3.11; manual twin: scripts/admin/purge-unconfirmed.mjs.
-- Rollback: _onboarding/purge-7d/ROLLBACK-PURGE.sql (cron.unschedule, drop function + log table, schema admin if empty).
-- Tests: tests/purge-unconfirmed-7d-db.test.mjs (PGlite, ALL migrations).
--
-- Deletion rule (ALL must hold, re-checked per row under FOR UPDATE):
--   email_confirmed_at IS NULL AND confirmed_at IS NULL AND phone_confirmed_at IS NULL AND last_sign_in_at IS NULL
--   AND created_at < now() - <days> (days >= 7 for a real run) AND admin._purge_user_has_data(id) = false
--   AND public.privacy_release_unconfirmed_trial(id) = true (same RPC the script uses: re-checks «never confirmed + never
--   signed in» inside the DB and frees the trial ledger row only this account created, so the real owner of the address
--   still gets the 7-day trial later).
-- Then: DELETE FROM auth.users (FK cascades remove the stub rows) → admin.purged_unconfirmed_log (hashes only) →
-- public.admin_audit_log (action unconfirmed_signup_purged, target_user null, like the script).
--
-- «Real data» (admin._purge_user_has_data → true = account is KEPT):
--   * EVERY foreign key to auth.users, found at run time from pg_constraint (so a table added later is checked automatically,
--     fail-safe), except the allowed stub tables below. On 2026-11-19 that is: account_access*, ai_review_usage,
--     ai_review_user_settings, ai_reviews, application_documents, applications, billing_customers (user_id, created_by),
--     billing_subscriptions, calendar_feeds, class_announcements, class_deadlines, class_goals, class_invitations,
--     class_members, class_notifications (user_id, actor_id), class_student_aliases (student_id, set_by), class_teachers,
--     class_view_log (teacher_id, student_id), classes, cvs, families, family_invites (created_by, used_by),
--     family_members (user_id, consent_by), friendships (requester_id, addressee_id), map_application_rewards, map_islands,
--     map_items, map_layouts, map_wallets, platform_admins, product_tour_state, profiles*, push_subscriptions, reminder_log,
--     reminder_settings, school_admins, school_teachers (user_id, added_by), user_roles*, waitlist_requests,
--     and in schema auth: sessions, mfa_factors, mfa_recovery_code_sets, oauth_authorizations, oauth_consents,
--     scim_users, webauthn_challenges, webauthn_credentials.   (* = allowed stub, see below)
--   * columns without a foreign key: storage.objects.owner / owner_id (uploaded files), storage.buckets.owner,
--     public.admin_audit_log.admin_id / target_user (an admin acted on or as this account).
--   No table references public.profiles by foreign key (checked 2026-11-19); funnel answers of a never-signed-in account live
--   only in auth metadata (wa_funnel, deleted with the user) – funnel_apply needs a session.
-- Allowed stub rows (created automatically at sign-up by the auth.users INSERT triggers, they carry nothing the person entered):
--   * public.profiles – _access_after_signup: id, user_id, email, account_type, birth_year (from the sign-up form); allowed
--     only while every other content column is empty (names '', all optional fields null / '{}', no onboarding / funnel /
--     tour timestamps, no weekly goal / help wishes).
--   * public.account_access – _access_ensure (trial row); allowed only while no admin touched it (no free access, not
--     blocked, updated_by null).
--   * public.user_roles – _soc_ensure (role student/teacher from metadata, display name from the address, invite code).
--   * auth.identities (email identity of every sign-up), auth.one_time_tokens (the pending confirmation token).
--   * public.trial_ledger has no user column; the row this account created is released by privacy_release_unconfirmed_trial.
-- Safety: SECURITY DEFINER, search_path '' (fully qualified names), EXECUTE only postgres / service_role; dry run by default;
-- days clamped to >= 7 for a real run; hard cap 200 candidates per run (more → exception, nothing deleted); advisory lock
-- against parallel runs. Schema admin is not exposed via PostgREST (db_schema = public, graphql_public) and has no USAGE for
-- anon / authenticated.

-- ---------------------------------------------------------------- 1. schema + log table
create schema if not exists admin;
revoke all on schema admin from public;
do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema admin from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on schema admin from authenticated'; end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then execute 'grant usage on schema admin to service_role'; end if;
end $g$;

create table if not exists admin.purged_unconfirmed_log (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  user_id_hash text not null check (user_id_hash ~ '^[0-9a-f]{64}$'),   -- sha256(id::text)
  email_hash text check (email_hash is null or email_hash ~ '^[0-9a-f]{64}$'), -- sha256(lower(email))
  created_at_user timestamptz not null,
  purged_at timestamptz not null default now(),
  dry_run boolean not null
);
alter table admin.purged_unconfirmed_log enable row level security;
revoke all on table admin.purged_unconfirmed_log from public;
do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on table admin.purged_unconfirmed_log from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on table admin.purged_unconfirmed_log from authenticated'; end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then execute 'grant select on table admin.purged_unconfirmed_log to service_role'; end if;
end $g$;

-- ---------------------------------------------------------------- 2. «has real data?» (true = keep the account)
create or replace function admin._purge_user_has_data(p_uid uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare fk record; v boolean;
begin
  if p_uid is null then return true; end if;
  -- every FK column to auth.users except the allowed stub tables
  for fk in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
      and c.conrelid not in ('public.profiles'::regclass, 'public.account_access'::regclass, 'public.user_roles'::regclass)
      and c.conrelid::regclass::text not in ('auth.identities', 'auth.one_time_tokens')
  loop
    execute format('select exists (select 1 from %s t where t.%I = $1)', fk.tbl, fk.col) into v using p_uid;
    if v then return true; end if;
  end loop;
  -- columns without a FK
  if exists (select 1 from storage.objects o where (to_jsonb(o) ->> 'owner') = p_uid::text or (to_jsonb(o) ->> 'owner_id') = p_uid::text)
    or exists (select 1 from storage.buckets b where (to_jsonb(b) ->> 'owner') = p_uid::text or (to_jsonb(b) ->> 'owner_id') = p_uid::text)
    or exists (select 1 from public.admin_audit_log l where l.admin_id = p_uid or l.target_user = p_uid) then
    return true;
  end if;
  -- stub tables: allowed only while they still look exactly like the sign-up trigger left them
  if exists (select 1 from public.profiles p where p.user_id = p_uid and (
      coalesce(p.first_name, '') <> '' or coalesce(p.last_name, '') <> ''
      or coalesce(p.phone, '') <> '' or coalesce(p.location, '') <> '' or coalesce(p.website, '') <> ''
      or coalesce(p.linkedin, '') <> '' or coalesce(p.avatar_url, '') <> '' or coalesce(p.display_name, '') <> ''
      or coalesce(p.school_level, '') <> '' or coalesce(cardinality(p.desired_professions), 0) > 0
      or coalesce(p.canton, '') <> '' or p.desired_start_year is not null or p.onboarding_completed_at is not null
      or coalesce(p.school, '') <> '' or coalesce(p.grade_level, '') <> '' or coalesce(p.desired_profession, '') <> ''
      or p.onboarding_tour_completed_at is not null or p.onboarding_tour_step is not null
      or p.weekly_goal is not null or coalesce(cardinality(p.help_wishes), 0) > 0
      or p.funnel_completed_at is not null or p.funnel_version is not null)) then
    return true;
  end if;
  if exists (select 1 from public.account_access a where a.user_id = p_uid and (
      coalesce(a.free_access_forever, false) or a.free_access_until is not null or a.free_access_granted_at is not null
      or a.blocked_at is not null or a.updated_by is not null)) then
    return true;
  end if;
  return false;
end;
$$;
revoke all on function admin._purge_user_has_data(uuid) from public;
do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on function admin._purge_user_has_data(uuid) from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on function admin._purge_user_has_data(uuid) from authenticated'; end if;
end $g$;

-- ---------------------------------------------------------------- 3. the purge
-- Returns {run_id, dry_run, days, candidates, deleted, would_delete, kept_with_data, ids (dry run only)}.
create or replace function admin.purge_unconfirmed_users(p_dry_run boolean default true, p_days integer default 7)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c_cap constant integer := 200;
  v_dry boolean := coalesce(p_dry_run, true);
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 3650);
  v_run uuid := gen_random_uuid();
  v_cutoff timestamptz;
  v_cand integer; v_del integer := 0; v_would integer := 0; v_kept integer := 0; v_ids uuid[] := '{}';
  u record;
begin
  if not v_dry and v_days < 7 then v_days := 7; end if;
  v_cutoff := now() - make_interval(days => v_days);
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('admin.purge_unconfirmed_users')) then
    return jsonb_build_object('run_id', v_run, 'skipped', 'another run is active');
  end if;

  select count(*) into v_cand from auth.users x
  where x.email_confirmed_at is null and x.confirmed_at is null and x.phone_confirmed_at is null
    and x.last_sign_in_at is null and x.created_at < v_cutoff;
  if v_cand > c_cap then
    raise exception 'PURGE_CAP_EXCEEDED: % candidates > cap %, nothing deleted', v_cand, c_cap;
  end if;

  for u in
    select x.id, x.email, x.created_at from auth.users x
    where x.email_confirmed_at is null and x.confirmed_at is null and x.phone_confirmed_at is null
      and x.last_sign_in_at is null and x.created_at < v_cutoff
    order by x.created_at
    for update of x
  loop
    -- FOR UPDATE re-evaluated the WHERE clause on the latest row version (a confirmation that committed meanwhile drops it)
    if admin._purge_user_has_data(u.id) then v_kept := v_kept + 1; continue; end if;
    if v_dry then
      v_would := v_would + 1; v_ids := v_ids || u.id;
    else
      -- same DB re-check + trial ledger release as the manual script; false = not eligible any more
      if not public.privacy_release_unconfirmed_trial(u.id) then v_kept := v_kept + 1; continue; end if;
      delete from auth.users x where x.id = u.id
        and x.email_confirmed_at is null and x.confirmed_at is null and x.phone_confirmed_at is null and x.last_sign_in_at is null;
      if not found then v_kept := v_kept + 1; continue; end if;
      v_del := v_del + 1;
      insert into public.admin_audit_log (admin_id, action, target_user, details)
      values (null, 'unconfirmed_signup_purged', null, jsonb_build_object('via', 'pg_cron admin.purge_unconfirmed_users',
        'days', v_days, 'created', to_char(u.created_at at time zone 'UTC', 'YYYY-MM-DD'), 'run_id', v_run));
    end if;
    insert into admin.purged_unconfirmed_log (run_id, user_id_hash, email_hash, created_at_user, dry_run)
    values (v_run, encode(sha256(convert_to(u.id::text, 'UTF8')), 'hex'),
      case when coalesce(u.email, '') = '' then null else encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex') end,
      u.created_at, v_dry);
  end loop;

  return jsonb_build_object('run_id', v_run, 'dry_run', v_dry, 'days', v_days, 'candidates', v_cand, 'deleted', v_del,
    'would_delete', v_would, 'kept_with_data', v_kept) || case when v_dry then jsonb_build_object('ids', to_jsonb(v_ids)) else '{}'::jsonb end;
end;
$$;
revoke all on function admin.purge_unconfirmed_users(boolean, integer) from public;
do $g$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on function admin.purge_unconfirmed_users(boolean, integer) from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on function admin.purge_unconfirmed_users(boolean, integer) from authenticated'; end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then execute 'grant execute on function admin.purge_unconfirmed_users(boolean, integer) to service_role'; end if;
end $g$;

-- ---------------------------------------------------------------- 4. daily schedule (03:17 UTC) via pg_cron
-- Skipped (notice) where pg_cron is not available, e.g. the PGlite test database. On Supabase it is (checked 2026-11-19).
do $c$ begin
  if not exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron not available – purge-unconfirmed-7d NOT scheduled';
    return;
  end if;
  create extension if not exists pg_cron with schema pg_catalog;
  if exists (select 1 from cron.job where jobname = 'purge-unconfirmed-7d') then
    perform cron.unschedule('purge-unconfirmed-7d');
  end if;
  perform cron.schedule('purge-unconfirmed-7d', '17 3 * * *', 'select admin.purge_unconfirmed_users(false, 7)');
end $c$;
