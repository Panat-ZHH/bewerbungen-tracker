-- B2B part 1: schools, school licences (manual, no billing), school admins, seat limit.
-- Run AFTER all earlier migrations. Additive and idempotent. Contract + reasoning: docs/b2b/DATA-MODEL.md.
--
-- Backwards compatible: classes.school_id is NULL for every existing class, and a class without a school behaves exactly
-- as before (no licence check at all). Licences are assigned MANUALLY (service role / SQL editor); there is no payment code.
-- Prices are NOT stored in the database (they live in lib/b2b/licence.ts).
--
-- Access model (same as the teacher migrations): new tables have RLS on; school admins may SELECT their own school,
-- licences and admin rows; nobody may write directly. Everything else goes through SECURITY DEFINER RPCs with
-- set search_path = ''. A school admin never sees application details, only aggregate counts of consenting students.

-- ---------- tables ----------
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  canton_or_state text not null default '' check (length(canton_or_state) <= 60),
  country text not null default 'CH' check (country in ('CH', 'DE', 'AT')),
  created_at timestamptz not null default now()
);

alter table public.classes add column if not exists school_id uuid references public.schools(id) on delete set null;
create index if not exists classes_school_idx on public.classes (school_id) where school_id is not null;

-- One row per contract period. Generic "plan" columns (package/status/dates/billing_interval) are shared with future
-- private/family plans: see _licence_state() below and docs/b2b/DATA-MODEL.md ("Extension point: other plan holders").
create table if not exists public.school_licences (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  package text not null check (package in ('pilot', 'starter', 'professional', 'enterprise', 'custom')),
  student_limit integer not null check (student_limit between 1 and 100000),
  status text not null default 'active' check (status in ('pilot', 'active', 'expired', 'cancelled')),
  pilot_start date,
  pilot_end date,
  valid_from date,
  valid_until date,
  billing_interval text not null default 'yearly' check (billing_interval in ('yearly', 'monthly')),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  check (pilot_end is null or pilot_start is null or pilot_end >= pilot_start),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check (status <> 'pilot' or pilot_start is not null)
);
create index if not exists school_licences_school_idx on public.school_licences (school_id, created_at desc);

create table if not exists public.school_admins (
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (school_id, user_id)
);
create index if not exists school_admins_user_idx on public.school_admins (user_id);

-- Role 'school_admin' (label for users who are ONLY school admins; it can never be self-assigned).
-- Authorisation is always the school_admins table, so a teacher can also be a school admin.
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.user_roles'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%role%student%teacher%' loop
    execute format('alter table public.user_roles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check check (role in ('student', 'teacher', 'school_admin'));

-- ---------- RLS ----------
alter table public.schools enable row level security;
alter table public.school_licences enable row level security;
alter table public.school_admins enable row level security;
revoke all on public.schools, public.school_licences, public.school_admins from anon, authenticated;
grant select on public.schools, public.school_licences, public.school_admins to authenticated;

create or replace function public.is_school_admin(p_school_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.school_admins a where a.school_id = p_school_id and a.user_id = auth.uid());
$$;

drop policy if exists "school admins read own school" on public.schools;
drop policy if exists "school admins read own licences" on public.school_licences;
drop policy if exists "school admins read own admin rows" on public.school_admins;
create policy "school admins read own school" on public.schools for select to authenticated using (public.is_school_admin(id));
create policy "school admins read own licences" on public.school_licences for select to authenticated using (public.is_school_admin(school_id));
create policy "school admins read own admin rows" on public.school_admins for select to authenticated using (public.is_school_admin(school_id));

-- ---------- licence defaults ----------
-- Fills student_limit from the package (pilot 60 = one or two classes, starter 100, professional 300, enterprise 800;
-- custom must be given) and pilot_end = pilot_start + 30 days. Keep in sync with PACKAGES in lib/b2b/licence.ts.
create or replace function public._licence_default_limit(p_package text)
returns integer language sql immutable set search_path = '' as $$
  select case p_package when 'pilot' then 60 when 'starter' then 100 when 'professional' then 300 when 'enterprise' then 800 end;
$$;

create or replace function public._school_licence_defaults()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.student_limit is null then new.student_limit := public._licence_default_limit(new.package); end if;
  if new.student_limit is null then raise exception 'LICENCE_LIMIT_REQUIRED' using detail = 'Für ein individuelles Paket muss die Schülerzahl angegeben werden.'; end if;
  if new.package = 'pilot' and new.status = 'active' and tg_op = 'INSERT' then new.status := 'pilot'; end if;
  if new.status = 'pilot' and new.pilot_start is null then new.pilot_start := current_date; end if;
  if new.pilot_start is not null and new.pilot_end is null then new.pilot_end := new.pilot_start + 30; end if;
  return new;
end;
$$;
drop trigger if exists school_licences_defaults on public.school_licences;
create trigger school_licences_defaults before insert or update on public.school_licences
  for each row execute function public._school_licence_defaults();

-- Generic plan state, reusable by any plan table (school, family, private):
--   'pilot' / 'active' = usable today; 'not_started' = valid_from in the future; 'expired' (incl. pilot past pilot_end,
--   active past valid_until); 'cancelled'.
create or replace function public._licence_state(p_status text, p_pilot_end date, p_valid_from date, p_valid_until date, p_today date default current_date)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_status = 'cancelled' then 'cancelled'
    when p_status = 'expired' then 'expired'
    when p_status = 'pilot' then case when p_pilot_end is not null and p_pilot_end < p_today then 'expired' else 'pilot' end
    when p_valid_from is not null and p_valid_from > p_today then 'not_started'
    when p_valid_until is not null and p_valid_until < p_today then 'expired'
    else 'active' end;
$$;

-- The licence that governs the school today: a usable one (newest first), else the newest row (to explain why it is not usable).
create or replace function public._school_current_licence(p_school_id uuid)
returns public.school_licences language sql stable security definer set search_path = '' as $$
  select l.* from public.school_licences l where l.school_id = p_school_id
  order by (public._licence_state(l.status, l.pilot_end, l.valid_from, l.valid_until) in ('pilot', 'active')) desc, l.created_at desc, l.id
  limit 1;
$$;

-- ---------- seat counting and enforcement ----------
-- Distinct students in the school's NOT archived classes (a student in two classes counts once; archiving frees seats).
create or replace function public._school_student_count(p_school_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(distinct m.student_id)::integer
  from public.class_members m join public.classes c on c.id = m.class_id
  where c.school_id = p_school_id and not c.archived;
$$;

-- Public wrapper: school admins and teachers of a class of that school only (service role: auth.uid() is null).
create or replace function public.school_student_count(p_school_id uuid)
returns integer language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is not null and not (
    exists (select 1 from public.school_admins a where a.school_id = p_school_id and a.user_id = uid)
    or exists (select 1 from public.classes c where c.school_id = p_school_id
      and (c.teacher_id = uid or exists (select 1 from public.class_teachers t where t.class_id = c.id and t.teacher_id = uid)))) then
    raise exception 'FORBIDDEN';
  end if;
  return public._school_student_count(p_school_id);
end;
$$;

-- Raises when adding p_new_students to the school would break the licence. Error contract (supabase-js: error.code,
-- error.message, error.details): WA001 LICENCE_LIMIT_REACHED, WA002 LICENCE_EXPIRED, WA003 LICENCE_MISSING.
-- The school row is locked so concurrent joins cannot both take the last seat.
create or replace function public._school_assert_capacity(p_school_id uuid, p_new_students uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare lic public.school_licences; st text; used integer; added integer;
begin
  if p_school_id is null then return; end if;
  perform 1 from public.schools s where s.id = p_school_id for update;
  -- Only students who are not yet counted for this school need a seat.
  select count(distinct x)::integer into added from unnest(coalesce(p_new_students, '{}'::uuid[])) x
    where not exists (select 1 from public.class_members m join public.classes c on c.id = m.class_id
      where c.school_id = p_school_id and not c.archived and m.student_id = x);
  if added = 0 then return; end if;
  lic := public._school_current_licence(p_school_id);
  if lic.id is null then
    raise exception 'LICENCE_MISSING' using errcode = 'WA003',
      detail = 'Für diese Schule ist noch keine Lizenz hinterlegt. Bitte wende dich an deine Lehrperson oder die Schulleitung.';
  end if;
  st := public._licence_state(lic.status, lic.pilot_end, lic.valid_from, lic.valid_until);
  if st not in ('pilot', 'active') then
    raise exception 'LICENCE_EXPIRED' using errcode = 'WA002',
      detail = case when lic.status = 'pilot' or st = 'expired' and lic.package = 'pilot'
        then 'Die Pilotphase dieser Schule ist abgelaufen. Neue Beitritte sind erst mit einer Jahreslizenz möglich.'
        else 'Die Lizenz dieser Schule ist nicht aktiv. Neue Beitritte sind erst nach der Verlängerung möglich.' end;
  end if;
  used := public._school_student_count(p_school_id);
  if used + added > lic.student_limit then
    raise exception 'LICENCE_LIMIT_REACHED' using errcode = 'WA001',
      detail = format('Die Schullizenz ist voll (%s von %s Plätzen belegt). Die Schulleitung kann die Lizenz erweitern.', used, lic.student_limit);
  end if;
end;
$$;

create or replace function public._class_members_licence_check()
returns trigger language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select c.school_id into sid from public.classes c where c.id = new.class_id and not c.archived;
  if sid is null then return new; end if; -- no school (or archived class): unchanged behaviour
  -- Re-joining an existing membership (insert ... on conflict do nothing) never needs a seat.
  if exists (select 1 from public.class_members m where m.class_id = new.class_id and m.student_id = new.student_id) then return new; end if;
  perform public._school_assert_capacity(sid, array[new.student_id]);
  return new;
end;
$$;
drop trigger if exists class_members_licence_check on public.class_members;
create trigger class_members_licence_check before insert on public.class_members
  for each row execute function public._class_members_licence_check();

-- A class that is attached to a school or un-archived brings all its members at once.
create or replace function public._classes_licence_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.school_id is null or new.archived then return new; end if;
  if tg_op = 'UPDATE' and old.school_id is not distinct from new.school_id and not (old.archived and not new.archived) then return new; end if;
  perform public._school_assert_capacity(new.school_id,
    (select coalesce(array_agg(m.student_id), '{}'::uuid[]) from public.class_members m where m.class_id = new.id));
  return new;
end;
$$;
drop trigger if exists classes_licence_check on public.classes;
create trigger classes_licence_check before insert or update of school_id, archived on public.classes
  for each row execute function public._classes_licence_check();

-- ---------- roles: a school admin cannot switch role by themselves ----------
create or replace function public.set_my_role(p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid();
begin
  if p_role is null or p_role not in ('student', 'teacher') then raise exception 'INVALID_REQUEST'; end if;
  if exists (select 1 from public.user_roles r where r.user_id = uid and r.role = p_role) then return; end if;
  if exists (select 1 from public.user_roles r where r.user_id = uid and r.role = 'school_admin') then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from public.classes c where c.teacher_id = uid)
    or exists (select 1 from public.class_teachers t where t.teacher_id = uid)
    or exists (select 1 from public.class_members m where m.student_id = uid) then
    raise exception 'FORBIDDEN';
  end if;
  update public.user_roles r set role = p_role where r.user_id = uid;
end;
$$;

-- ---------- school admin RPCs ----------
create or replace function public._school_admin_of(p_school_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid();
begin
  if not exists (select 1 from public.school_admins a where a.school_id = p_school_id and a.user_id = uid) then raise exception 'FORBIDDEN'; end if;
  return uid;
end;
$$;

-- Licence summary as JSON (no prices: those are in the app). null when the school has no licence row.
create or replace function public._school_licence_json(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare lic public.school_licences; used integer := public._school_student_count(p_school_id);
begin
  lic := public._school_current_licence(p_school_id);
  if lic.id is null then return null; end if;
  return jsonb_build_object(
    'id', lic.id, 'package', lic.package, 'status', lic.status,
    'state', public._licence_state(lic.status, lic.pilot_end, lic.valid_from, lic.valid_until),
    'student_limit', lic.student_limit, 'students_used', used, 'seats_left', greatest(lic.student_limit - used, 0),
    'pilot_start', lic.pilot_start, 'pilot_end', lic.pilot_end, 'valid_from', lic.valid_from, 'valid_until', lic.valid_until,
    'billing_interval', lic.billing_interval,
    'days_left', case
      when public._licence_state(lic.status, lic.pilot_end, lic.valid_from, lic.valid_until) = 'pilot' then lic.pilot_end - current_date
      when lic.valid_until is not null then lic.valid_until - current_date end);
end;
$$;

-- Schools the caller administers (for the admin entry page).
create or replace function public.school_admin_my_schools()
returns table (school_id uuid, name text, canton_or_state text, country text, licence jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid();
begin
  return query
    select s.id, s.name, s.canton_or_state, s.country, public._school_licence_json(s.id)
    from public.school_admins a join public.schools s on s.id = a.school_id
    where a.user_id = uid order by s.name, s.id;
end;
$$;

-- Admin dashboard. Aggregates only, and only of students who share their progress with the class
-- (share_applications; "placed" additionally needs share_status). No names of students, no application rows.
create or replace function public.school_admin_overview(p_school_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public._school_admin_of(p_school_id);
  with cls as (
    select c.id, c.name, c.school_year, c.archived, c.created_at, c.teacher_id from public.classes c where c.school_id = p_school_id),
  mem as (
    select m.class_id, m.student_id, m.share_applications as sa, m.share_applications and m.share_status as ss,
      (select count(*)::integer from public.applications a where a.user_id = m.student_id) as apps,
      (select count(*)::integer from public.applications a where a.user_id = m.student_id and a.status in ('offer', 'contract_signed')) as placed_n,
      (select max(greatest(a.applied_at, a.created_at, a.updated_at)) from public.applications a where a.user_id = m.student_id) as last_date
    from public.class_members m join cls on cls.id = m.class_id),
  per_class as (
    select cl.id, cl.name, cl.school_year, cl.archived, cl.created_at, r.display_name as teacher_name,
      count(mem.student_id)::integer as students,
      (count(*) filter (where mem.sa))::integer as students_sharing,
      coalesce(sum(mem.apps) filter (where mem.sa), 0)::integer as applications,
      (count(*) filter (where mem.sa and mem.apps > 0))::integer as students_with_application,
      (count(*) filter (where mem.ss and mem.placed_n > 0))::integer as students_placed,
      (count(*) filter (where mem.sa and mem.last_date >= current_date - 14))::integer as students_active_14d
    from cls cl left join mem on mem.class_id = cl.id left join public.user_roles r on r.user_id = cl.teacher_id
    group by cl.id, cl.name, cl.school_year, cl.archived, cl.created_at, r.display_name),
  teachers as (
    select x.teacher_id, r.display_name, count(distinct x.class_id)::integer as classes
    from (select c.teacher_id, c.id as class_id from cls c union select t.teacher_id, t.class_id from public.class_teachers t join cls c on c.id = t.class_id) x
    left join public.user_roles r on r.user_id = x.teacher_id group by x.teacher_id, r.display_name),
  uniq as (select distinct on (mem.student_id) mem.* from mem join cls on cls.id = mem.class_id where not cls.archived
    order by mem.student_id, mem.sa desc, mem.ss desc)
  select jsonb_build_object(
    'school', (select jsonb_build_object('id', s.id, 'name', s.name, 'canton_or_state', s.canton_or_state, 'country', s.country) from public.schools s where s.id = p_school_id),
    'licence', public._school_licence_json(p_school_id),
    'totals', jsonb_build_object(
      'classes', (select count(*) from cls where not archived), 'archived_classes', (select count(*) from cls where archived),
      'teachers', (select count(*) from teachers), 'students', (select count(*) from uniq),
      'students_sharing', (select count(*) from uniq where sa),
      'suppressed', (select count(*) from uniq where sa) < 3,
      'applications', case when (select count(*) from uniq where sa) >= 3 then (select coalesce(sum(apps), 0) from uniq where sa) end,
      'students_with_application', case when (select count(*) from uniq where sa) >= 3 then (select count(*) from uniq where sa and apps > 0) end,
      'students_placed', case when (select count(*) from uniq where sa) >= 3 then (select count(*) from uniq where ss and placed_n > 0) end,
      'students_active_14d', case when (select count(*) from uniq where sa) >= 3 then (select count(*) from uniq where sa and last_date >= current_date - 14) end),
    -- Small groups (< 3 sharing students) are suppressed (null) so a count can never be traced back to one student.
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'school_year', p.school_year, 'archived', p.archived,
      'teacher_name', p.teacher_name, 'students', p.students, 'students_sharing', p.students_sharing,
      'suppressed', p.students_sharing < 3,
      'applications', case when p.students_sharing >= 3 then p.applications end,
      'students_with_application', case when p.students_sharing >= 3 then p.students_with_application end,
      'students_placed', case when p.students_sharing >= 3 then p.students_placed end,
      'students_active_14d', case when p.students_sharing >= 3 then p.students_active_14d end)
      order by p.archived, p.name, p.id) from per_class p), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(jsonb_build_object('teacher_id', t.teacher_id, 'display_name', coalesce(t.display_name, ''), 'classes', t.classes)
      order by t.display_name, t.teacher_id) from teachers t), '[]'::jsonb))
  into result;
  return result;
end;
$$;

-- Attach a class to the school by its join code (the teacher gives the code to the school admin). Checks the seats.
create or replace function public.school_attach_class(p_school_id uuid, p_join_code text)
returns table (class_id uuid, name text, students integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare c public.classes;
begin
  perform public._school_admin_of(p_school_id);
  select * into c from public.classes x where x.join_code = upper(btrim(coalesce(p_join_code, '')));
  if not found then raise exception 'CLASS_NOT_FOUND'; end if;
  if c.school_id is not null and c.school_id <> p_school_id then raise exception 'CLASS_IN_OTHER_SCHOOL'; end if;
  update public.classes x set school_id = p_school_id where x.id = c.id; -- classes_licence_check raises WA001-WA003
  return query select c.id, c.name, (select count(*)::integer from public.class_members m where m.class_id = c.id);
end;
$$;

create or replace function public.school_detach_class(p_school_id uuid, p_class_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._school_admin_of(p_school_id);
  update public.classes c set school_id = null where c.id = p_class_id and c.school_id = p_school_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

-- Teacher view: school + licence of one of their classes (null school = private class without licence).
create or replace function public.class_school_info(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  perform public._soc_teacher_of(p_class_id);
  select c.school_id into sid from public.classes c where c.id = p_class_id;
  if sid is null then return jsonb_build_object('school', null, 'licence', null); end if;
  return jsonb_build_object(
    'school', (select jsonb_build_object('id', s.id, 'name', s.name, 'canton_or_state', s.canton_or_state, 'country', s.country) from public.schools s where s.id = sid),
    'licence', public._school_licence_json(sid));
end;
$$;

-- ---------- platform admin (service role only; there is no platform-admin UI) ----------
create or replace function public.platform_create_school(p_name text, p_canton_or_state text default '', p_country text default 'CH')
returns uuid language sql security definer set search_path = '' as $$
  insert into public.schools (name, canton_or_state, country) values (btrim(p_name), btrim(coalesce(p_canton_or_state, '')), coalesce(p_country, 'CH')) returning id;
$$;

create or replace function public.platform_assign_licence(p_school_id uuid, p_package text, p_status text default null,
  p_student_limit integer default null, p_start date default current_date, p_end date default null,
  p_billing_interval text default 'yearly', p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare st text := coalesce(p_status, case when p_package = 'pilot' then 'pilot' else 'active' end); new_id uuid;
begin
  insert into public.school_licences (school_id, package, status, student_limit, pilot_start, pilot_end, valid_from, valid_until, billing_interval, notes)
  values (p_school_id, p_package, st, p_student_limit,
    case when st = 'pilot' then coalesce(p_start, current_date) end, case when st = 'pilot' then p_end end,
    case when st <> 'pilot' then coalesce(p_start, current_date) end,
    case when st <> 'pilot' then coalesce(p_end, coalesce(p_start, current_date) + interval '1 year' - interval '1 day')::date end,
    coalesce(p_billing_interval, 'yearly'), p_notes)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.platform_add_school_admin(p_school_id uuid, p_email text, p_make_role boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  select u.id into target from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, '')));
  if target is null then raise exception 'USER_NOT_FOUND'; end if;
  perform public._soc_ensure(target);
  insert into public.school_admins (school_id, user_id) values (p_school_id, target) on conflict do nothing;
  -- Pure admins (no classes) get the role label so the app shows the admin area instead of the student area.
  if p_make_role and not exists (select 1 from public.class_members m where m.student_id = target) then
    update public.user_roles r set role = 'school_admin' where r.user_id = target and r.role <> 'teacher';
  end if;
  return target;
end;
$$;

-- ---------- privileges ----------
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
    'is_school_admin', '_licence_default_limit', '_school_licence_defaults', '_licence_state', '_school_current_licence', '_school_student_count',
    'school_student_count', '_school_assert_capacity', '_class_members_licence_check', '_classes_licence_check', 'set_my_role', '_school_admin_of',
    '_school_licence_json', 'school_admin_my_schools', 'school_admin_overview', 'school_attach_class', 'school_detach_class', 'class_school_info',
    'platform_create_school', 'platform_assign_licence', 'platform_add_school_admin') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
    'is_school_admin', 'school_student_count', 'set_my_role', 'school_admin_my_schools', 'school_admin_overview', 'school_attach_class',
    'school_detach_class', 'class_school_info') loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
      'platform_create_school', 'platform_assign_licence', 'platform_add_school_admin', 'school_student_count') loop
      execute format('grant execute on function %s to service_role', f);
    end loop;
  end if;
end $$;
