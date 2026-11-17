-- Access model, part 2: the paywall in the database (branch acc-backend, 2026-11-18). Contract: docs/access/SPEC.md §1, §3, §8;
-- full list + reasons: docs/access/GUARDS.md. Run AFTER 20261118010000_access_core.sql. ADDITIVE ONLY and idempotent.
--
-- Everything here asks public.has_app_access() (always TRUE while access_settings.enforce_mode = 'test_users' for normal
-- users, or 'off'), so this migration changes nothing for live users before public.access_go_live().
--
-- 1. Direct table writes (PostgREST, role authenticated). The client can INSERT/UPDATE exactly these tables (all other
--    tables have no client write policy): applications, application_documents, cvs, profiles, push_subscriptions,
--    reminder_settings, calendar_feeds, class_goals. Each gets RESTRICTIVE insert + update policies. SELECT and DELETE are
--    unchanged (read own data and delete own data stay allowed after the trial).
--    Exceptions (SPEC §8 G2 "Meine Daten löschen" must always work):
--      * profiles / cvs UPDATE are gated by a trigger instead of a policy: without access, an UPDATE may only move columns to
--        their "cleared" value (lib/storage.ts CLEARED_PROFILE, cvs file fields → null). That keeps clearLocalData,
--        removeAvatar and the delete→blank trigger of 20261117163000 working, and nothing else.
--      * reminder_settings: switching e-mail AND push off is always allowed (stop mails).
-- 2. Storage: restrictive INSERT/UPDATE on storage.objects for the buckets cvs and avatars. Downloads and removals unchanged.
-- 3. SECURITY DEFINER RPCs that create or change user content (they bypass RLS): renamed to public._acc_impl_<name>
--    (no client grants) and replaced by a wrapper with the identical name, arguments, defaults, return type and grants that
--    first calls public._assert_app_access() (raises PAYWALL, P0001). Teacher+student RPCs (class_announcement_list,
--    class_deadline_list, class_goal_progress) only assert for the class's teachers (students keep reading).
--    NOT gated on purpose (SPEC §8): class join / preview / invite accept (G1: that is how a student gets school access),
--    families (G3), account_set_type / set_my_role (G7), exports + account deletion summary (G2/G11), billing, school admin
--    views, privacy switches, leaving / removing / deleting, reads. See docs/access/GUARDS.md.
--    MERGE NOTE: a later "create or replace function public.<name>" of a wrapped function replaces the wrapper (the guard is
--    gone, the app keeps working). Re-run select public._acc_wrap(...) for it, or rebase on public._acc_impl_<name>.

-- ---------------------------------------------------------------- 1. tables
do $$
declare t text;
begin
  foreach t in array array['applications', 'application_documents', 'cvs', 'profiles', 'push_subscriptions', 'reminder_settings',
    'calendar_feeds', 'class_goals'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "access gate insert" on public.%I', t);
    execute format('create policy "access gate insert" on public.%I as restrictive for insert to authenticated with check ((select public.has_app_access()))', t);
    execute format('drop policy if exists "access gate update" on public.%I', t);
    if t not in ('profiles', 'cvs') then
      execute format('create policy "access gate update" on public.%I as restrictive for update to authenticated using (true) with check (%s)', t,
        case when t = 'reminder_settings' then '(select public.has_app_access()) or (email = false and push = false)'
             else '(select public.has_app_access())' end);
    end if;
  end loop;
end $$;

-- profiles / cvs UPDATE without access: every changed column must move to its cleared value.
create or replace function public._access_only_clearing(p_old jsonb, p_new jsonb, p_cleared jsonb, p_free text[])
returns boolean language sql immutable set search_path = '' as $$
  select not exists (
    select 1 from jsonb_each(p_new) n
    where n.value is distinct from p_old -> n.key
      and not (n.key = any (p_free))
      and not (p_cleared ? n.key and n.value = p_cleared -> n.key));
$$;
revoke all on function public._access_only_clearing(jsonb, jsonb, jsonb, text[]) from public, anon;
grant execute on function public._access_only_clearing(jsonb, jsonb, jsonb, text[]) to authenticated; -- pure; used by the invoker trigger

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
      "onboarding_tour_completed_at": null, "onboarding_tour_step": null}';
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
-- "zz": fires after the existing BEFORE UPDATE guards (they pin id / account_type for clients), so only real changes count.
drop trigger if exists profiles_zz_access_gate on public.profiles;
create trigger profiles_zz_access_gate before update on public.profiles for each row execute function public._access_gate_clear_update();
drop trigger if exists cvs_zz_access_gate on public.cvs;
create trigger cvs_zz_access_gate before update on public.cvs for each row execute function public._access_gate_clear_update();

-- ---------------------------------------------------------------- 2. storage (cvs, avatars)
drop policy if exists "access gate insert" on storage.objects;
create policy "access gate insert" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('cvs', 'avatars') or (select public.has_app_access()));
drop policy if exists "access gate update" on storage.objects;
create policy "access gate update" on storage.objects as restrictive for update to authenticated
  using (true) with check (bucket_id not in ('cvs', 'avatars') or (select public.has_app_access()));

-- ---------------------------------------------------------------- 3. RPC wrappers
-- Teachers of the class need access; students of the class keep reading.
create or replace function public._acc_assert_teacher(p_class_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null and public._soc_can_teach(auth.uid(), p_class_id) then perform public._assert_app_access(); end if;
end;
$$;
revoke all on function public._acc_assert_teacher(uuid) from public, anon, authenticated;

-- Wraps public.<p_name>(<p_args>) once: rename to _acc_impl_<p_name>, create the guarding wrapper, copy the grants.
-- p_mode 'all' = _assert_app_access(); 'teacher' = _acc_assert_teacher(p_class_id). Idempotent; re-wraps a function that a
-- later migration replaced (wrapper body without _acc_impl_).
create or replace function public._acc_wrap(p_name text, p_args text, p_mode text default 'all')
returns void language plpgsql set search_path = '' as $wrap$
declare
  fn regprocedure := to_regprocedure(format('public.%I(%s)', p_name, p_args));
  impl_name text := '_acc_impl_' || p_name;
  impl regprocedure := to_regprocedure(format('public.%I(%s)', impl_name, p_args));
  pr record; call_args text; guard text; body text; grants text[] := '{}'; r text;
begin
  if fn is null then raise exception 'access guard: public.%(%) not found', p_name, p_args; end if;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) and has_function_privilege(r, fn, 'EXECUTE') then grants := grants || r; end if;
  end loop;
  if impl is not null and position(impl_name in (select p.prosrc from pg_proc p where p.oid = fn)) = 0 then
    execute format('drop function %s', impl); -- the wrapper was replaced by a newer original: wrap that one
    impl := null;
  end if;
  if impl is null then
    execute format('alter function %s rename to %I', fn, impl_name);
    impl := to_regprocedure(format('public.%I(%s)', impl_name, p_args));
  end if;
  execute format('revoke all on function %s from public', impl);
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then execute format('revoke all on function %s from %I', impl, r); end if;
  end loop;
  select p.provolatile, p.proretset, pg_get_function_arguments(p.oid) as args_def, pg_get_function_result(p.oid) as result,
    p.prorettype = 'void'::regtype as is_void, p.proargnames, p.proargmodes, p.pronargs
    into pr from pg_proc p where p.oid = impl;
  select coalesce(string_agg(format('%1$I => %1$I', n), ', ' order by i), '') into call_args
    from unnest(pr.proargnames[1:pr.pronargs]) with ordinality as a(n, i)
    where pr.proargmodes is null or pr.proargmodes[i] in ('i', 'b', 'v');
  guard := case p_mode when 'teacher' then 'perform public._acc_assert_teacher(p_class_id);' else 'perform public._assert_app_access();' end;
  body := case
    when pr.proretset then format('return query select * from public.%I(%s);', impl_name, call_args)
    when pr.is_void then format('perform public.%I(%s);', impl_name, call_args)
    else format('return public.%I(%s);', impl_name, call_args) end;
  execute format($f$create or replace function public.%I(%s) returns %s language plpgsql %s security definer set search_path = '' as $w$
begin
  -- access guard (20261118020000_access_guards.sql); original logic: public.%I
  %s
  %s
end;
$w$$f$, p_name, pr.args_def, pr.result, case pr.provolatile when 's' then 'stable' when 'i' then 'stable' else 'volatile' end,
    impl_name, guard, body);
  -- New functions get Supabase's default privileges (anon too): reset, then grant only signed-in roles that had it before.
  execute format('revoke all on function public.%I(%s) from public', p_name, p_args);
  if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function public.%I(%s) from anon', p_name, p_args); end if;
  foreach r in array grants loop
    if r <> 'anon' then execute format('grant execute on function public.%I(%s) to %I', p_name, p_args, r); end if;
  end loop;
end;
$wrap$;
revoke all on function public._acc_wrap(text, text, text) from public, anon, authenticated;

select public._acc_wrap(n, a, m) from (values
  -- teacher side (teachers have access only via school licence or admin grant)
  ('class_create', 'text, text', 'all'), ('class_rename', 'uuid, text, text', 'all'), ('class_set_archived', 'uuid, boolean', 'all'),
  ('class_regenerate_code', 'uuid', 'all'), ('class_add_coteacher', 'uuid, text', 'all'), ('class_coteachers', 'uuid', 'all'),
  ('class_members', 'uuid', 'all'), ('class_list_mine', '', 'all'), ('class_announce', 'uuid, text', 'all'),
  ('class_deadline_add', 'uuid, text, date, text', 'all'), ('class_invite_create', 'uuid, text, integer, integer', 'all'),
  ('class_invite_create_many', 'uuid, text[], integer', 'all'), ('class_invite_create_many_v2', 'uuid, text[], integer', 'all'),
  ('class_invite_list', 'uuid', 'all'), ('class_log_view', 'uuid, uuid', 'all'), ('class_nudge', 'uuid, uuid, text', 'all'),
  ('class_overview', 'uuid', 'all'), ('class_overview_stats', 'uuid, integer', 'all'), ('class_set_self_report', 'uuid, boolean', 'all'),
  ('class_set_student_alias', 'uuid, uuid, text', 'all'), ('class_student_aliases', 'uuid', 'all'),
  ('class_student_applications', 'uuid, uuid', 'all'), ('class_student_timeline', 'uuid, uuid', 'all'), ('class_school_info', 'uuid', 'all'),
  ('teacher_attention', 'uuid, integer', 'all'), ('teacher_class_applications_export', 'uuid', 'all'),
  ('teacher_class_students', 'uuid, integer', 'all'), ('teacher_dashboard', 'integer', 'all'),
  ('school_attach_class', 'uuid, text', 'all'), ('school_add_teacher', 'uuid, text', 'all'),
  -- shared class views: gated for the class's teachers only
  ('class_announcement_list', 'uuid', 'teacher'), ('class_deadline_list', 'uuid, date, date', 'teacher'), ('class_goal_progress', 'uuid', 'teacher'),
  -- student content: village / shop / coins / rewards, friends, profile, onboarding, parent's child view
  ('map_claim_application_rewards', '', 'all'), ('map_island_unlock', 'integer', 'all'), ('map_move_object', 'text, integer, integer, integer', 'all'),
  ('map_shop_buy', 'text, uuid', 'all'), ('map_shop_place', 'uuid, integer, integer, integer', 'all'),
  ('social_send_request', 'text', 'all'), ('social_find_by_code', 'text', 'all'), ('social_respond_request', 'uuid, boolean', 'all'),
  ('social_update_profile', 'text, text, boolean', 'all'), ('profile_set_display_name', 'text', 'all'),
  ('student_onboarding_save', 'text, text, text, text[], text, text, integer, boolean', 'all'),
  ('family_child_overview', 'uuid', 'all')
) as t(n, a, m);
