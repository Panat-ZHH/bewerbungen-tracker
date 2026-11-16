-- B2B part 2: shared class goals (with aggregate-only progress) and the consent-aware class statistics for teachers.
-- Run AFTER 20261116100000_b2b_schools_licences.sql. Additive and idempotent. Contract: docs/b2b/DATA-MODEL.md.
--
-- Privacy rules (same as the teacher migrations):
--   * every number about a student comes only from students who share with the class (class_members.share_applications);
--     anything derived from the application STATUS additionally needs share_status. Company names are never returned here.
--   * class members (students) only ever get aggregates of the whole class, and only when at least 3 students contribute
--     (otherwise "suppressed"), so a classmate's numbers cannot be singled out.

-- ---------- helpers usable in RLS policies (caller-only booleans) ----------
create or replace function public.is_class_teacher(p_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'teacher')
    and exists (select 1 from public.classes c where c.id = p_class_id
      and (c.teacher_id = auth.uid() or exists (select 1 from public.class_teachers t where t.class_id = c.id and t.teacher_id = auth.uid())));
$$;

create or replace function public.is_class_member(p_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.class_members m where m.class_id = p_class_id and m.student_id = auth.uid());
$$;

-- ---------- class goals ----------
-- target = per-student target (e.g. "each of you sends 5 applications"); 'custom' goals have no automatic progress.
create table if not exists public.class_goals (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  description text check (description is null or length(description) <= 1000),
  metric text not null default 'custom' check (metric in ('applications_sent', 'interviews', 'trial_days', 'custom')),
  target integer check (target is null or target between 1 and 1000),
  due_date date,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (metric = 'custom' or target is not null)
);
create index if not exists class_goals_class_idx on public.class_goals (class_id, due_date);

alter table public.class_goals enable row level security;
revoke all on public.class_goals from anon, authenticated;
grant select, insert, update, delete on public.class_goals to authenticated;
drop policy if exists "class goals read" on public.class_goals;
drop policy if exists "class goals insert" on public.class_goals;
drop policy if exists "class goals update" on public.class_goals;
drop policy if exists "class goals delete" on public.class_goals;
create policy "class goals read" on public.class_goals for select to authenticated
  using (public.is_class_teacher(class_id) or public.is_class_member(class_id));
create policy "class goals insert" on public.class_goals for insert to authenticated
  with check (public.is_class_teacher(class_id) and created_by = auth.uid());
create policy "class goals update" on public.class_goals for update to authenticated
  using (public.is_class_teacher(class_id)) with check (public.is_class_teacher(class_id));
create policy "class goals delete" on public.class_goals for delete to authenticated
  using (public.is_class_teacher(class_id));

-- created_by cannot be forged or changed later.
create or replace function public._class_goals_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.created_by := old.created_by; new.created_at := old.created_at; new.class_id := old.class_id; end if;
  new.title := btrim(new.title);
  return new;
end;
$$;
drop trigger if exists class_goals_guard on public.class_goals;
create trigger class_goals_guard before insert or update on public.class_goals for each row execute function public._class_goals_guard();

-- Per-student value of a goal metric, null when the student does not share what the metric needs.
create or replace function public._goal_metric_value(p_student uuid, p_metric text, p_share boolean, p_share_status boolean)
returns integer language sql stable security definer set search_path = '' as $$
  select case
    when not p_share or p_metric = 'custom' then null
    when p_metric = 'applications_sent' then (select count(*)::integer from public.applications a where a.user_id = p_student
      and (a.applied_at is not null or (p_share_status and a.status in ('applied', 'aptitude_test', 'interview', 'final_interview', 'offer', 'contract_signed', 'rejected'))))
    when p_metric = 'interviews' then case when p_share_status then (select count(*)::integer from public.applications a where a.user_id = p_student
      and a.status in ('interview', 'final_interview', 'offer', 'contract_signed')) end
    when p_metric = 'trial_days' then (select count(*)::integer from public.applications a where a.user_id = p_student
      and ((a.schnupper_date is not null and a.schnupper_date <= current_date) or (p_share_status and a.schnupper_date is null and a.status = 'schnupper_done')))
  end;
$$;

-- Goals of a class with aggregate progress only. Teachers of the class and class members may call it.
-- Members get null numbers (suppressed = true) while fewer than 3 students contribute to a goal.
create or replace function public.class_goal_progress(p_class_id uuid)
returns table (goal_id uuid, title text, description text, metric text, target integer, due_date date, created_at timestamptz,
  students_total integer, students_counted integer, students_reached integer, total_value integer, average_value numeric, suppressed boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid(); teacher boolean;
begin
  teacher := public._soc_can_teach(uid, p_class_id);
  if not teacher and not exists (select 1 from public.class_members m where m.class_id = p_class_id and m.student_id = uid) then
    raise exception 'FORBIDDEN';
  end if;
  return query
    with vals as (
      select g.id as gid, m.student_id, public._goal_metric_value(m.student_id, g.metric, m.share_applications, m.share_applications and m.share_status) as v
      from public.class_goals g join public.class_members m on m.class_id = g.class_id
      where g.class_id = p_class_id),
    agg as (
      select g.id, count(v.student_id)::integer as total_students, count(v.v)::integer as counted,
        (count(*) filter (where v.v is not null and v.v >= g.target))::integer as reached,
        coalesce(sum(v.v), 0)::integer as total_v, round(avg(v.v), 1) as avg_v
      from public.class_goals g left join vals v on v.gid = g.id where g.class_id = p_class_id group by g.id, g.target)
    select g.id, g.title, g.description, g.metric, g.target, g.due_date, g.created_at, a.total_students,
      case when g.metric = 'custom' then 0 else a.counted end,
      case when g.metric = 'custom' or (not teacher and a.counted < 3) then null else a.reached end,
      case when g.metric = 'custom' or (not teacher and a.counted < 3) then null else a.total_v end,
      case when g.metric = 'custom' or (not teacher and a.counted < 3) then null else a.avg_v end,
      g.metric <> 'custom' and not teacher and a.counted < 3
    from public.class_goals g join agg a on a.id = g.id
    order by g.due_date nulls last, g.created_at, g.id;
end;
$$;

-- ---------- class statistics for teachers ----------
-- Per student: only non-confidential progress counts (no company, position, notes, documents). needs_support + reasons:
--   self_report       student said "noch keine Lehrstelle" (voluntary; the only reason visible without sharing)
--   no_application    sharing student without any application
--   no_activity       sharing student whose last activity is older than p_inactive_days (default 14)
--   upcoming_deadline student sharing progress AND status with an application in 'saved'/'preparing' due within 7 days
--   many_rejections   status shared and at least 3 rejections
-- Students with a shared offer / signed contract ("placed") never need support (same rule as teacher_attention).
create or replace function public.class_overview_stats(p_class_id uuid, p_inactive_days integer default 14)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare days integer := least(greatest(coalesce(p_inactive_days, 14), 1), 365); result jsonb;
begin
  perform public._soc_teacher_of(p_class_id);
  with base as (
    select m.student_id, r.display_name, r.avatar_seed, al.alias, m.joined_at,
      m.share_applications as sa, m.share_applications and m.share_status as ss, m.self_report_no_placement as sr, s.*
    from public.class_members m
    join public.user_roles r on r.user_id = m.student_id
    left join public.class_student_aliases al on al.class_id = m.class_id and al.student_id = m.student_id
    left join lateral (
      select count(*)::integer as total,
        (count(*) filter (where a.status in ('offer', 'contract_signed')))::integer as placed_n,
        (count(*) filter (where a.status = 'rejected'))::integer as rejected_n,
        (count(*) filter (where a.deadline between current_date and current_date + 7 and a.status in ('saved', 'preparing')))::integer as due_soon,
        max(greatest(a.applied_at, a.created_at, a.updated_at)) as last_date
      from public.applications a where a.user_id = m.student_id and m.share_applications) s on true
    where m.class_id = p_class_id),
  st as (
    select b.*,
      b.ss and coalesce(b.placed_n, 0) > 0 as placed,
      array_remove(array[
        case when b.sr then 'self_report' end,
        case when b.sa and b.total = 0 then 'no_application' end,
        case when b.sa and b.total > 0 and b.last_date < current_date - days then 'no_activity' end,
        case when b.ss and b.due_soon > 0 then 'upcoming_deadline' end, -- 'saved'/'preparing' is a status
        case when b.ss and b.rejected_n >= 3 then 'many_rejections' end], null) as raw_reasons
    from base b),
  fin as (select s.*, case when s.placed then '{}'::text[] else s.raw_reasons end as reasons from st s)
  select jsonb_build_object(
    'class_id', p_class_id,
    'generated_at', now(),
    'inactive_days', days,
    'totals', jsonb_build_object(
      'students', (select count(*) from fin),
      'students_sharing', (select count(*) from fin where sa),
      'students_sharing_status', (select count(*) from fin where ss),
      'applications', (select coalesce(sum(total), 0) from fin where sa),
      'status_counts', coalesce((select jsonb_object_agg(x.status, x.n) from (
        select a.status, count(*)::integer as n from fin f join public.applications a on a.user_id = f.student_id where f.ss group by a.status) x), '{}'::jsonb),
      'students_with_application', (select count(*) from fin where sa and total > 0),
      'students_placed', (select count(*) from fin where placed),
      'students_active', (select count(*) from fin where sa and last_date >= current_date - days),
      'needs_support', (select count(*) from fin where cardinality(reasons) > 0),
      'reasons', jsonb_build_object(
        'self_report', (select count(*) from fin where 'self_report' = any (reasons)),
        'no_application', (select count(*) from fin where 'no_application' = any (reasons)),
        'no_activity', (select count(*) from fin where 'no_activity' = any (reasons)),
        'upcoming_deadline', (select count(*) from fin where 'upcoming_deadline' = any (reasons)),
        'many_rejections', (select count(*) from fin where 'many_rejections' = any (reasons)))),
    'students', coalesce((select jsonb_agg(jsonb_build_object(
        'student_id', f.student_id, 'display_name', f.display_name, 'alias', f.alias, 'avatar_seed', f.avatar_seed, 'joined_at', f.joined_at,
        'hidden', not f.sa, 'share_status', f.ss,
        'applications', case when f.sa then f.total else null end,
        'status_counts', case when f.ss then public._soc_status_counts(f.student_id) else null end,
        'last_activity', case when f.sa then f.last_date end,
        'placed', f.placed,
        'needs_support', cardinality(f.reasons) > 0,
        'reasons', to_jsonb(f.reasons))
      order by cardinality(f.reasons) = 0, coalesce(f.alias, f.display_name), f.student_id) from fin f), '[]'::jsonb))
  into result;
  return result;
end;
$$;

-- ---------- privileges ----------
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
    'is_class_teacher', 'is_class_member', '_class_goals_guard', '_goal_metric_value', 'class_goal_progress', 'class_overview_stats') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
    'is_class_teacher', 'is_class_member', 'class_goal_progress', 'class_overview_stats') loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
