-- Onboarding funnel + product tour (branch onb-data, 2026-11-19). ADDITIVE ONLY, idempotent.
-- Spec: _onboarding/SPEC-DATA.md §2.4 (+ DECISIONS.md #2/#3). Docs: docs/onboarding/DATA.md, docs/access/GUARDS.md, docs/access/DB.md.
-- Runs after 20261118800000. Tests: tests/onb-data-funnel-db.test.mjs, tests/onb-data-tour-db.test.mjs (PGlite, ALL migrations).
--
-- The security release (sec-release, NOT on main at the time of writing) adds an invisible-character strip trigger and DB length
-- CHECKs. This migration does not depend on them: funnel_apply strips the same invisible characters itself and checks every length,
-- enum and range. Nothing here replaces a function or trigger of the 7 sec-release migrations (see _onboarding/REPORT-data.md).
-- NOTE for the later security release: its migrations have EARLIER timestamps → `supabase db push --include-all` is needed then.
--
-- Rollback: app only (the schema is backward compatible). Emergency DB revert SQL: docs/onboarding/DATA.md §Rollback.

-- ---------------------------------------------------------------- 1. profiles: new columns
alter table public.profiles add column if not exists weekly_goal smallint;
alter table public.profiles add column if not exists help_wishes text[] not null default '{}';
alter table public.profiles add column if not exists funnel_completed_at timestamptz;
alter table public.profiles add column if not exists funnel_version smallint;

alter table public.profiles drop constraint if exists profiles_funnel_limits;
alter table public.profiles add constraint profiles_funnel_limits check (
  (weekly_goal is null or weekly_goal between 1 and 20)
  and cardinality(help_wishes) <= 5
  and help_wishes <@ array['lebenslauf','brief','schnuppern','ueberblick','eltern','fristen','dokumente','ermutigen']::text[]
  and (funnel_version is null or funnel_version between 1 and 99)
);

-- funnel_completed_at / funnel_version: only funnel_apply (definer) writes them. Direct table writes keep the old values.
create or replace function public._profiles_funnel_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.funnel_completed_at := null; new.funnel_version := null;
  else
    new.funnel_completed_at := old.funnel_completed_at; new.funnel_version := old.funnel_version;
  end if;
  return new;
end;
$$;
revoke all on function public._profiles_funnel_guard() from public, anon, authenticated;
drop trigger if exists profiles_funnel_guard on public.profiles;
create trigger profiles_funnel_guard before insert or update on public.profiles
  for each row execute function public._profiles_funnel_guard();

-- «Meine Daten löschen» without access must be able to clear the new personal columns too
-- (same body as 20261118020000 + the keys weekly_goal / help_wishes; lib/storage.ts CLEARED_PROFILE must match – parity test).
create or replace function public._access_gate_clear_update()
returns trigger language plpgsql set search_path = '' as $$
declare cleared jsonb; free text[] := '{}';
begin
  if current_user not in ('authenticated', 'anon') then return new; end if; -- definer RPCs / service role: unchanged
  if public.has_app_access() then return new; end if;
  if tg_table_name = 'profiles' then
    cleared := '{"first_name": "", "last_name": "", "email": "", "phone": null, "location": null, "website": null, "linkedin": null,
      "avatar_url": null, "display_name": null, "school": null, "grade_level": null, "desired_profession": null, "school_level": null,
      "desired_professions": [], "canton": null, "desired_start_year": null, "onboarding_completed_at": null,
      "onboarding_tour_completed_at": null, "onboarding_tour_step": null, "weekly_goal": null, "help_wishes": []}';
  else
    cleared := '{"file_name": null, "storage_path": null, "file_type": null, "file_size": null, "status": "Draft"}';
    free := array['updated_at'];
  end if;
  if not public._access_only_clearing(to_jsonb(old), to_jsonb(new), cleared, free) then
    raise exception 'PAYWALL' using errcode = 'P0001', detail = 'Dein Zugang ist abgelaufen. Wähle ein Abo, um weiterzumachen.';
  end if;
  return new;
end;
$$;
revoke all on function public._access_gate_clear_update() from public, anon, authenticated;

-- Profile «delete» blanks the row (20261117163000) – now including the funnel answers. funnel_completed_at stays (not personal
-- content; it stops a stale browser copy from being applied again), like account_type / birth_year.
create or replace function public._profiles_delete_keeps_account()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return old; end if;
  update public.profiles p set
    first_name = '', last_name = '', email = '', phone = null, location = null, website = null, linkedin = null,
    avatar_url = null, display_name = null, school = null, grade_level = null, desired_profession = null,
    school_level = null, desired_professions = '{}', canton = null, desired_start_year = null,
    onboarding_completed_at = null, onboarding_tour_completed_at = null, onboarding_tour_step = null,
    weekly_goal = null, help_wishes = '{}'
  where p.id = old.id;
  return null;
end;
$$;
revoke all on function public._profiles_delete_keeps_account() from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. product tour state
create table if not exists public.product_tour_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  tour text not null check (tour in ('schueler', 'eltern', 'lehrperson', 'schule')),
  version smallint not null check (version between 1 and 99),
  status text not null check (status in ('completed', 'skipped')),
  last_step smallint check (last_step is null or last_step between 0 and 30),
  updated_at timestamptz not null default now(),
  primary key (user_id, tour)
);
alter table public.product_tour_state enable row level security;
revoke all on public.product_tour_state from public, anon, authenticated;
grant select on public.product_tour_state to authenticated;
drop policy if exists "own tour state" on public.product_tour_state;
create policy "own tour state" on public.product_tour_state for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.tour_state_set(p_tour text, p_version integer, p_status text, p_step integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._rl_enforce('tour', 60, 1200, 3600);
  if p_tour is null or p_tour not in ('schueler', 'eltern', 'lehrperson', 'schule') then raise exception 'INVALID_REQUEST' using detail = 'tour'; end if;
  if p_version is null or p_version not between 1 and 99 then raise exception 'INVALID_REQUEST' using detail = 'version'; end if;
  if p_status is null or p_status not in ('completed', 'skipped') then raise exception 'INVALID_REQUEST' using detail = 'status'; end if;
  if p_step is not null and p_step not between 0 and 30 then raise exception 'INVALID_REQUEST' using detail = 'step'; end if;
  insert into public.product_tour_state (user_id, tour, version, status, last_step, updated_at)
  values (uid, p_tour, p_version, p_status, p_step, now())
  on conflict (user_id, tour) do update set version = excluded.version, status = excluded.status,
    last_step = excluded.last_step, updated_at = now();
  return jsonb_build_object('tour', p_tour, 'version', p_version, 'status', p_status);
end;
$$;
revoke all on function public.tour_state_set(text, integer, text, integer) from public, anon;
grant execute on function public.tour_state_set(text, integer, text, integer) to authenticated;

-- ---------------------------------------------------------------- 3. weekly goal (dashboard)
create or replace function public.weekly_goal_set(p_goal integer)
returns smallint language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mail text; g smallint;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._rl_enforce('weekly-goal', 120, 2400, 3600);
  if p_goal is null or p_goal not between 1 and 20 then raise exception 'INVALID_REQUEST' using detail = 'weekly_goal'; end if;
  select coalesce(u.email, '') into mail from auth.users u where u.id = uid;
  insert into public.profiles (id, user_id, first_name, last_name, email, weekly_goal)
  values ('profile-' || uid::text, uid, '', '', mail, p_goal)
  on conflict (user_id) do update set weekly_goal = excluded.weekly_goal
  returning weekly_goal into g;
  return g;
end;
$$;
revoke all on function public.weekly_goal_set(integer) from public, anon;
grant execute on function public.weekly_goal_set(integer) to authenticated;
-- paywall like student_onboarding_save; on a re-run the plain function above replaced the wrapper, so wrap again
select public._acc_wrap('weekly_goal_set', 'integer');

-- ---------------------------------------------------------------- 4. funnel_apply
-- Same character set as sec-release's _strip_invisible_columns (single-line variant): C0 controls, DEL, ALM, MVS, ZWSP, LRM/RLM,
-- bidi embeddings/overrides/isolates, word joiner + invisible operators, BOM, interlinear annotation. ZWJ/ZWNJ are kept.
-- Mirror: lib/funnel/validate.ts INVISIBLE.
create or replace function public._funnel_clean(p_value text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    regexp_replace(p_value, '[\u0001-\u001F\u007F؜᠎​‎‏‪-‮⁠-⁤⁦-⁩﻿￹-￻]', '', 'g'),
    '\s+', ' ', 'g'));
$$;
revoke all on function public._funnel_clean(text) from public, anon, authenticated;

create or replace function public._funnel_role_of(p_uid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.user_roles r where r.user_id = p_uid and r.role = 'teacher') then 'teacher'
    when exists (select 1 from public.user_roles r where r.user_id = p_uid and r.role = 'school_admin')
      or exists (select 1 from public.school_admins s where s.user_id = p_uid) then 'school_admin'
    when exists (select 1 from public.profiles p where p.user_id = p_uid and p.account_type = 'parent') then 'parent'
    else 'student' end;
$$;
revoke all on function public._funnel_role_of(uuid) from public, anon, authenticated;

-- Saves the funnel answers of the signed-in user ONCE. p_answers = the browser copy; null = the copy stored at sign-up
-- (auth metadata wa_funnel, e-mail sign-up confirmed in another browser). Validates everything (mirror: lib/funnel/validate.ts).
-- Never changes an established role; never grants school_admin / admin; teacher access stays behind the licence gate.
-- Errors: NOT_AUTHENTICATED, RATE_LIMITED (via _rl_enforce), INVALID_FUNNEL (detail = field name only, never the value).
create or replace function public.funnel_apply(p_answers jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  y integer := extract(year from current_date)::integer;
  u record; a jsonb; k text; e jsonb;
  v_role text; v_skip boolean; v_first text; v_year integer; v_level text; v_canton text; v_place text;
  v_profs text[] := '{}'; v_unsure boolean := false; v_start integer; v_goal integer; v_help text[] := '{}';
  cur_role text; in_class boolean; mismatch boolean := false;
  levels constant text[] := array['7. Klasse', '8. Klasse', '9. Klasse – Sek A / Bezirk', '9. Klasse – Sek B / Real',
    '9. Klasse – Sek C / Werkklasse', '9. Klasse – Gymnasium', '10. Schuljahr / Brückenangebot',
    'Schon in einer Lehre / Ausbildung', 'Etwas anderes'];
  cantons constant text[] := array['AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU','NE','NW','OW','SG','SH','SO',
    'SZ','TG','TI','UR','VD','VS','ZG','ZH'];
  help_student constant text[] := array['lebenslauf', 'brief', 'schnuppern', 'ueberblick', 'eltern'];
  help_parent constant text[] := array['ueberblick', 'fristen', 'dokumente', 'ermutigen'];
  keys constant text[] := array['v','role','skipped','firstName','birthYear','schoolLevel','canton','place','professions','unsure',
    'startYear','weeklyGoal','help'];
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._rl_enforce('funnel', 10, 300, 3600);
  perform public._soc_ensure(uid);
  select x.email, (to_jsonb(x) ->> 'created_at')::timestamptz as created_at, x.raw_user_meta_data as meta
    into u from auth.users x where x.id = uid;
  -- one save at a time per user (double click, two tabs): the second call waits and then sees already_done
  perform pg_advisory_xact_lock(hashtextextended('funnel_apply:' || uid::text, 0));

  -- apply once, only to new accounts
  if exists (select 1 from public.profiles p where p.user_id = uid
             and (p.funnel_completed_at is not null or p.onboarding_completed_at is not null)) then
    return jsonb_build_object('applied', false, 'reason', 'already_done', 'role', public._funnel_role_of(uid));
  end if;
  if u.created_at is null or u.created_at < now() - interval '14 days' then
    return jsonb_build_object('applied', false, 'reason', 'not_new', 'role', public._funnel_role_of(uid));
  end if;
  a := coalesce(p_answers, u.meta -> 'wa_funnel');
  if a is null or a = 'null'::jsonb then
    return jsonb_build_object('applied', false, 'reason', 'no_answers', 'role', public._funnel_role_of(uid));
  end if;

  -- shape
  if jsonb_typeof(a) <> 'object' then raise exception 'INVALID_FUNNEL' using detail = 'size'; end if;
  if octet_length(a::text) > 4096 then raise exception 'INVALID_FUNNEL' using detail = 'size'; end if;
  for k in select jsonb_object_keys(a) loop
    if not (k = any (keys)) then raise exception 'INVALID_FUNNEL' using detail = 'key'; end if;
  end loop;
  if a -> 'v' is distinct from '1'::jsonb then raise exception 'INVALID_FUNNEL' using detail = 'v'; end if;
  v_role := case when jsonb_typeof(a -> 'role') = 'string' then a ->> 'role' end;
  if v_role is null or v_role not in ('student', 'parent', 'staff') then raise exception 'INVALID_FUNNEL' using detail = 'role'; end if;
  if a ? 'skipped' and jsonb_typeof(a -> 'skipped') not in ('boolean', 'null') then raise exception 'INVALID_FUNNEL' using detail = 'key'; end if;
  v_skip := coalesce(a -> 'skipped' = 'true'::jsonb, false);

  if not v_skip then
    -- first name (all roles)
    if jsonb_typeof(a -> 'firstName') is distinct from 'string' then raise exception 'INVALID_FUNNEL' using detail = 'firstName'; end if;
    v_first := public._funnel_clean(a ->> 'firstName');
    if char_length(v_first) not between 1 and 40 or v_first ~ '[[:cntrl:]]' or v_first !~ '[[:alpha:]]' then
      raise exception 'INVALID_FUNNEL' using detail = 'firstName';
    end if;

    if v_role = 'student' then
      if jsonb_typeof(a -> 'birthYear') is distinct from 'number' or (a ->> 'birthYear') !~ '^[0-9]{4}$' then
        raise exception 'INVALID_FUNNEL' using detail = 'birthYear'; end if;
      v_year := (a ->> 'birthYear')::integer;
      if v_year not between y - 100 and y - 8 then raise exception 'INVALID_FUNNEL' using detail = 'birthYear'; end if;

      v_level := case when jsonb_typeof(a -> 'schoolLevel') = 'string' then a ->> 'schoolLevel' end;
      if v_level is null or not (v_level = any (levels)) then raise exception 'INVALID_FUNNEL' using detail = 'schoolLevel'; end if;

      v_canton := case when jsonb_typeof(a -> 'canton') = 'string' then a ->> 'canton' end;
      if v_canton is null or not (v_canton = any (cantons)) then raise exception 'INVALID_FUNNEL' using detail = 'canton'; end if;

      if jsonb_typeof(a -> 'place') = 'string' then
        v_place := nullif(public._funnel_clean(a ->> 'place'), '');
        if char_length(coalesce(v_place, '')) > 60 or v_place ~ '[[:cntrl:]]' then raise exception 'INVALID_FUNNEL' using detail = 'place'; end if;
      elsif a ? 'place' and a -> 'place' <> 'null'::jsonb then raise exception 'INVALID_FUNNEL' using detail = 'place';
      end if;

      if a ? 'unsure' and jsonb_typeof(a -> 'unsure') not in ('boolean', 'null') then raise exception 'INVALID_FUNNEL' using detail = 'unsure'; end if;
      v_unsure := coalesce(a -> 'unsure' = 'true'::jsonb, false);
      if a ? 'professions' and a -> 'professions' <> 'null'::jsonb then
        if jsonb_typeof(a -> 'professions') <> 'array' or jsonb_array_length(a -> 'professions') > 3 then
          raise exception 'INVALID_FUNNEL' using detail = 'professions'; end if;
        for e in select * from jsonb_array_elements(a -> 'professions') loop
          if jsonb_typeof(e) <> 'string' or char_length(public._funnel_clean(e #>> '{}')) not between 1 and 60 then
            raise exception 'INVALID_FUNNEL' using detail = 'professions'; end if;
        end loop;
        select coalesce(array_agg(s.x order by s.i), '{}') into v_profs from (
          select distinct on (lower(public._funnel_clean(t.v))) public._funnel_clean(t.v) as x, t.i
          from jsonb_array_elements_text(a -> 'professions') with ordinality t(v, i)
          order by lower(public._funnel_clean(t.v)), t.i) s;
      end if;
      if v_unsure and cardinality(v_profs) > 0 then raise exception 'INVALID_FUNNEL' using detail = 'professions'; end if;

      if a ? 'startYear' and a -> 'startYear' <> 'null'::jsonb then
        if jsonb_typeof(a -> 'startYear') <> 'number' or (a ->> 'startYear') !~ '^[0-9]{4}$' then
          raise exception 'INVALID_FUNNEL' using detail = 'startYear'; end if;
        v_start := (a ->> 'startYear')::integer;
        if v_start not between y - 1 and y + 4 then raise exception 'INVALID_FUNNEL' using detail = 'startYear'; end if;
        if cardinality(v_profs) = 0 then v_start := null; end if;
      end if;

      if jsonb_typeof(a -> 'weeklyGoal') is distinct from 'number' or (a ->> 'weeklyGoal') !~ '^[0-9]{1,2}$' then
        raise exception 'INVALID_FUNNEL' using detail = 'weeklyGoal'; end if;
      v_goal := (a ->> 'weeklyGoal')::integer;
      if v_goal not between 1 and 10 then raise exception 'INVALID_FUNNEL' using detail = 'weeklyGoal'; end if;
    end if;

    if v_role in ('student', 'parent') and a ? 'help' and a -> 'help' <> 'null'::jsonb then
      if jsonb_typeof(a -> 'help') <> 'array' or jsonb_array_length(a -> 'help') > 5 then
        raise exception 'INVALID_FUNNEL' using detail = 'help'; end if;
      for e in select * from jsonb_array_elements(a -> 'help') loop
        if jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (case when v_role = 'student' then help_student else help_parent end)) then
          raise exception 'INVALID_FUNNEL' using detail = 'help'; end if;
      end loop;
      select coalesce(array_agg(distinct h), '{}') into v_help from jsonb_array_elements_text(a -> 'help') h;
    end if;
  end if;

  -- role: established roles are never changed by the funnel; school_admin / platform admin never come from here
  select r.role into cur_role from public.user_roles r where r.user_id = uid;
  in_class := exists (select 1 from public.class_members m where m.student_id = uid);
  if v_role = 'staff' then
    if coalesce(cur_role, 'student') not in ('teacher', 'school_admin') then
      begin perform public.set_my_role('teacher');
      exception when others then mismatch := true; end;
    end if;
  elsif cur_role in ('teacher', 'school_admin') or exists (select 1 from public.school_admins s where s.user_id = uid) then
    mismatch := true;
  else
    begin
      perform public.account_set_type(
        case when v_role = 'parent' then 'parent' when in_class then 'school_student' else 'independent_student' end,
        v_year);
    exception when others then mismatch := true; end;
  end if;
  -- role kept → keep only the first name; answers of the other role are not stored (data minimisation)
  if mismatch then
    v_year := null; v_level := null; v_canton := null; v_place := null; v_profs := '{}'; v_start := null; v_goal := null;
    v_help := '{}'; v_skip := true;
  end if;
  if v_year is not null then
    update public.user_roles r set under_16 = (y - v_year - 1 < 16) where r.user_id = uid and r.under_16 is null;
  end if;

  -- answers
  insert into public.profiles (id, user_id, first_name, last_name, email, display_name, school_level, desired_professions, canton,
    location, desired_start_year, weekly_goal, help_wishes, funnel_completed_at, funnel_version, onboarding_completed_at,
    onboarding_tour_completed_at)
  values ('profile-' || uid::text, uid, coalesce(v_first, ''), '', coalesce(u.email, ''), v_first, v_level, v_profs, v_canton,
    v_place, v_start, v_goal, v_help, now(), 1, case when v_role = 'student' and not v_skip then now() end, now())
  on conflict (user_id) do update set
    first_name = coalesce(v_first, public.profiles.first_name),
    display_name = coalesce(v_first, public.profiles.display_name),
    school_level = coalesce(v_level, public.profiles.school_level),
    desired_professions = case when v_role = 'student' and not v_skip then v_profs else public.profiles.desired_professions end,
    canton = coalesce(v_canton, public.profiles.canton),
    location = coalesce(v_place, public.profiles.location),
    desired_start_year = coalesce(v_start, public.profiles.desired_start_year),
    weekly_goal = coalesce(v_goal, public.profiles.weekly_goal),
    help_wishes = case when cardinality(v_help) > 0 then v_help else public.profiles.help_wishes end,
    funnel_completed_at = now(), funnel_version = 1,
    onboarding_completed_at = coalesce(public.profiles.onboarding_completed_at, case when v_role = 'student' and not v_skip then now() end),
    onboarding_tour_completed_at = coalesce(public.profiles.onboarding_tour_completed_at, now());  -- old wizard/tour never shown

  -- the name others see: the first name instead of the e-mail local part (pupils, parents; teachers only if it was the e-mail part)
  if v_first is not null then
    update public.user_roles r set display_name = v_first
    where r.user_id = uid and (r.role = 'student' or r.display_name = '' or r.display_name = split_part(coalesce(u.email, ''), '@', 1));
  end if;

  return jsonb_build_object('applied', true, 'role', public._funnel_role_of(uid), 'role_mismatch', mismatch,
    'under_16', v_year is not null and y - v_year - 1 < 16);
end;
$$;
revoke all on function public.funnel_apply(jsonb) from public, anon;
grant execute on function public.funnel_apply(jsonb) to authenticated;

-- ---------------------------------------------------------------- 5. unconfirmed sign-ups must not burn the trial
-- Called by the (service role) clean-up script scripts/admin/purge-unconfirmed.mjs BEFORE it deletes a never-confirmed,
-- never-signed-in user via the Admin API: removes the trial ledger row that only this account created, so the real owner of
-- the address still gets 7 days later.
create or replace function public.privacy_release_unconfirmed_trial(p_uid uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare u record; v_end timestamptz; h text;
begin
  select x.email, (to_jsonb(x) ->> 'email_confirmed_at') as confirmed, (to_jsonb(x) ->> 'last_sign_in_at') as last_in
    into u from auth.users x where x.id = p_uid;
  if not found or u.confirmed is not null or u.last_in is not null then return false; end if;
  select a.trial_ends_at into v_end from public.account_access a where a.user_id = p_uid;
  h := public._access_email_hash(u.email);
  if h is not null and v_end is not null then
    delete from public.trial_ledger l where l.email_hash = h and l.first_trial_ends_at = v_end
      and not exists (select 1 from auth.users o where o.id <> p_uid and public._access_email_hash(o.email) = h);
  end if;
  return true;
end;
$$;
revoke all on function public.privacy_release_unconfirmed_trial(uuid) from public, anon, authenticated;
do $g$ begin if exists (select 1 from pg_roles where rolname = 'service_role') then
  grant execute on function public.privacy_release_unconfirmed_trial(uuid) to service_role; end if; end $g$;
