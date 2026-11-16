-- B2B part 4: fixes from the RLS / privilege audit of 2026-11-16 (full findings: docs/b2b/DATA-MODEL.md, "RLS audit").
-- Run AFTER 20261116120000_b2b_data_rights.sql. Idempotent; no data is changed.

-- 1. class_student_applications returned the Berufsfeld (category) of every application with only "Fortschritt teilen" on.
--    The consent text promises job details (Firma, Stelle, Ort) only with "Firmen zeigen", so category now follows share_companies.
create or replace function public.class_student_applications(p_class_id uuid, p_student_id uuid)
returns table (hidden boolean, id text, company text, "position" text, status text, category text, location text,
  deadline date, applied_at date, created_at date, updated_at date)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare m public.class_members;
begin
  perform public._soc_teacher_of(p_class_id);
  select * into m from public.class_members x where x.class_id = p_class_id and x.student_id = p_student_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not m.share_applications then
    return query select true, null::text, null::text, null::text, null::text, null::text, null::text, null::date, null::date, null::date, null::date;
    return;
  end if;
  return query
    select false, a.id,
      case when m.share_companies then a.company end, case when m.share_companies then a.position end,
      case when m.share_status then a.status end, case when m.share_companies then a.category end,
      case when m.share_companies then a.location end, a.deadline, a.applied_at, a.created_at, a.updated_at
    from public.applications a where a.user_id = p_student_id
    order by a.updated_at desc, a.id;
end;
$$;
revoke all on function public.class_student_applications(uuid, uuid) from public, anon, authenticated;
grant execute on function public.class_student_applications(uuid, uuid) to authenticated;

-- 2. Defense in depth for the new tables and for tables created after 20261109080000 (Supabase's default privileges grant
--    everything to anon on every new table; RLS already blocks it, this removes the privilege as well).
do $$
declare t text;
begin
  foreach t in array array['ai_reviews', 'ai_review_user_settings', 'schools', 'school_licences', 'school_admins', 'class_goals'] loop
    if to_regclass('public.' || t) is not null then execute format('revoke all on table public.%I from anon', t); end if;
  end loop;
end $$;

-- 3. Trigger-only and internal functions must not be callable through the API (Supabase grants EXECUTE on new functions
--    to anon and authenticated by default). Trigger functions cannot be called directly, but keep the surface minimal.
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
    'create_default_cvs_for_user', 'map_layouts_lock_streets', '_soc_after_signup', '_class_member_default_sharing',
    '_school_licence_defaults', '_class_members_licence_check', '_classes_licence_check', '_class_goals_guard') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
