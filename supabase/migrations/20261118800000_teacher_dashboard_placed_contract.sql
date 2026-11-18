-- Teacher home «Zusage oder Lehrvertrag» counted only students with an `offer`; the class page (lib/status.ts
-- isPlacedFromCounts) also counts `contract_signed`, so the same class showed 1 on /teacher and 2 on /teacher/classes/[id]
-- (AUDIT-B P1, QA M5 lehrperson). Fix: `placed` (per class and in the totals) = offers > 0 OR a shared contract_signed status.
--
-- ADDITIVE, idempotent, no schema change. Only the original logic public._acc_impl_teacher_dashboard(integer) is replaced
-- (MERGE NOTE in 20261118020000_access_guards.sql): the guarding wrapper public.teacher_dashboard(integer), its grants
-- (authenticated only) and its access check stay exactly as they are. Same signature, default, return type, plpgsql,
-- SECURITY DEFINER, search_path = ''. Everything else in the body is byte-identical to the live function.
-- status_counts comes from _teacher_stats and is '{}' unless the student shares applications AND status, so nothing new
-- becomes visible to the teacher (same rule as `offers`).

do $$
begin
  if to_regprocedure('public._acc_impl_teacher_dashboard(integer)') is null then
    raise exception 'teacher_dashboard placed fix: public._acc_impl_teacher_dashboard(integer) missing (run 20261118020000_access_guards.sql first)';
  end if;
end $$;

create or replace function public._acc_impl_teacher_dashboard(p_inactive_days integer default 14)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_require_role('teacher'); days integer := least(greatest(coalesce(p_inactive_days, 14), 1), 365); result jsonb;
begin
  with st as (select * from public._teacher_stats(uid, days, null)),
  cls as (
    select c.id, c.name, c.school_year, c.archived, c.join_code, c.created_at, c.teacher_id = uid as is_owner
    from public.classes c where c.teacher_id = uid or exists (select 1 from public.class_teachers t where t.class_id = c.id and t.teacher_id = uid)),
  per_class as (
    select cl.*, count(st.student_id)::integer as students, coalesce(sum(st.total), 0)::integer as applications,
      coalesce(sum(st.interviews), 0)::integer as interviews, coalesce(sum(st.offers), 0)::integer as offers,
      (count(*) filter (where st.offers > 0 or coalesce((st.status_counts ->> 'contract_signed')::integer, 0) > 0))::integer as placed, (count(*) filter (where st.inactive))::integer as inactive,
      (count(*) filter (where st.hidden))::integer as hidden
    from cls cl left join st on st.class_id = cl.id group by cl.id, cl.name, cl.school_year, cl.archived, cl.join_code, cl.created_at, cl.is_owner),
  uniq as (select distinct on (s.student_id) s.* from st s where not s.archived order by s.student_id, s.hidden, s.share_status desc, s.total desc),
  dl as (
    select distinct on (a.id) c.id as class_id, c.name as class_name, m.student_id, r.display_name as student_name, a.company, a.position, a.deadline, a.id, c.created_at
    from public.class_members m
    join cls c on c.id = m.class_id and not c.archived
    join public.user_roles r on r.user_id = m.student_id
    join public.applications a on a.user_id = m.student_id
    where m.share_applications and m.share_companies and a.deadline between current_date and current_date + 14 and a.status in ('saved', 'preparing')
    order by a.id, c.created_at)
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'students', (select count(*) from uniq), 'classes', (select count(*) from cls where not archived),
      'applications', (select coalesce(sum(total), 0) from uniq), 'interviews', (select coalesce(sum(interviews), 0) from uniq),
      'offers', (select coalesce(sum(offers), 0) from uniq), 'placed', (select count(*) from uniq where offers > 0 or coalesce((status_counts ->> 'contract_signed')::integer, 0) > 0),
      'inactive', (select count(*) from uniq where inactive), 'deadlines_7d', (select count(*) from dl where deadline <= current_date + 7),
      'hidden_students', (select count(*) from uniq where hidden)),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'school_year', p.school_year, 'archived', p.archived,
      'is_owner', p.is_owner, 'join_code', p.join_code, 'students', p.students, 'applications', p.applications, 'interviews', p.interviews,
      'offers', p.offers, 'placed', p.placed, 'inactive', p.inactive, 'hidden', p.hidden) order by p.archived, p.created_at desc, p.id) from per_class p), '[]'::jsonb),
    'deadlines', coalesce((select jsonb_agg(jsonb_build_object('class_id', d.class_id, 'class_name', d.class_name, 'student_id', d.student_id,
      'student_name', d.student_name, 'company', d.company, 'position', d.position, 'deadline', d.deadline) order by d.deadline, d.id)
      from (select * from dl order by deadline, id limit 20) d), '[]'::jsonb))
  into result;
  return result;
end;
$$;

-- Same grants as before (create or replace keeps them; restated so a replay can't widen them): no client may call the impl.
revoke all on function public._acc_impl_teacher_dashboard(integer) from public, anon, authenticated;
