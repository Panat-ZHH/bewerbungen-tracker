-- Teacher role: co-teachers, archiving, dashboard, invitations, granular consent, announcements and nudges.
-- Run AFTER 20260101000000_schema.sql, 20260101000001_social.sql and 20261104000000_class_management.sql.
-- Idempotent and non-destructive: only adds tables/columns/functions; existing rows keep their values (new consent flags default to true,
-- i.e. exactly what students already shared). Spec: docs/teacher-contract.md. Privacy model: docs/social-classes.md.
-- Teachers NEVER read foreign tables directly; every cross-user read goes through the security-definer RPCs below
-- (set search_path = ''). Teachers see only own/co-taught classes, only consented shared fields, never notes/documents/contacts/salary.

-- ---------- tables and columns ----------
alter table public.classes add column if not exists archived boolean not null default false;
alter table public.classes add column if not exists archived_at timestamptz;

alter table public.class_members add column if not exists share_status boolean not null default true;
alter table public.class_members add column if not exists share_companies boolean not null default true;

create table if not exists public.class_teachers (
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (class_id, teacher_id)
);
create index if not exists class_teachers_teacher_idx on public.class_teachers (teacher_id);

create table if not exists public.class_invitations (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  token text not null unique check (length(token) >= 22),
  email text check (email is null or email = lower(email)),
  max_uses integer check (max_uses is null or max_uses between 1 and 500),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists class_invitations_class_idx on public.class_invitations (class_id);

create table if not exists public.class_announcements (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (length(text) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists class_announcements_class_idx on public.class_announcements (class_id, created_at desc);

create table if not exists public.class_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('nudge', 'announcement')),
  class_id uuid references public.classes(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  message text check (message is null or length(message) <= 500),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists class_notifications_user_idx on public.class_notifications (user_id, created_at desc);
create index if not exists class_notifications_nudge_idx on public.class_notifications (class_id, user_id, created_at desc) where kind = 'nudge';

-- Strict RLS: enabled, no policies, no grants -> direct access is denied for everybody except the security-definer functions.
alter table public.class_teachers enable row level security;
alter table public.class_invitations enable row level security;
alter table public.class_announcements enable row level security;
alter table public.class_notifications enable row level security;
revoke all on public.class_teachers, public.class_invitations, public.class_announcements, public.class_notifications from anon, authenticated;

-- ---------- helpers (internal, executable by nobody) ----------
-- Teacher of the class = owner or co-teacher. Same signature as before, now also allows co-teachers.
create or replace function public._soc_teacher_of(p_class uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_require_role('teacher');
begin
  if not exists (select 1 from public.classes c where c.id = p_class
    and (c.teacher_id = uid or exists (select 1 from public.class_teachers t where t.class_id = c.id and t.teacher_id = uid))) then
    raise exception 'FORBIDDEN';
  end if;
  return uid;
end;
$$;

-- Owner only (delete class, manage co-teachers).
create or replace function public._soc_owner_of(p_class uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_require_role('teacher');
begin
  if not exists (select 1 from public.classes c where c.id = p_class and c.teacher_id = uid) then raise exception 'FORBIDDEN'; end if;
  return uid;
end;
$$;

-- Same test without raising (for functions open to teachers AND members).
create or replace function public._soc_can_teach(p_uid uuid, p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = p_uid and r.role = 'teacher')
    and exists (select 1 from public.classes c where c.id = p_class
      and (c.teacher_id = p_uid or exists (select 1 from public.class_teachers t where t.class_id = c.id and t.teacher_id = p_uid)));
$$;

-- Consent-aware per-student statistics for all classes of a teacher (or one class). Hidden students yield only zeros/nulls.
-- interviews/offers/status need share_applications AND share_status; last activity needs share_applications.
-- "placed" = at least one application with status 'offer' (the "Lehrstelle gefunden" / formerly "Zusage" status).
drop function if exists public._teacher_stats(uuid, integer, uuid);
create function public._teacher_stats(p_uid uuid, p_days integer, p_class uuid default null)
returns table (class_id uuid, archived boolean, student_id uuid, display_name text, avatar_seed text, joined_at timestamptz,
  hidden boolean, share_status boolean, share_companies boolean, total integer, status_counts jsonb, interviews integer, offers integer,
  last_activity timestamptz, inactive boolean)
language sql stable security definer set search_path = '' as $$
  select m.class_id, c.archived, m.student_id, r.display_name, r.avatar_seed, m.joined_at,
    not m.share_applications,
    m.share_applications and m.share_status,
    m.share_applications and m.share_companies,
    case when m.share_applications then coalesce(s.total, 0) else 0 end,
    case when m.share_applications and m.share_status then public._soc_status_counts(m.student_id) else '{}'::jsonb end,
    case when m.share_applications and m.share_status then coalesce(s.interviews, 0) else 0 end,
    case when m.share_applications and m.share_status then coalesce(s.offers, 0) else 0 end,
    case when m.share_applications then s.last_date::timestamptz end,
    m.share_applications and (s.last_date is null or s.last_date < current_date - greatest(p_days, 1))
  from public.class_members m
  join public.classes c on c.id = m.class_id
  join public.user_roles r on r.user_id = m.student_id
  left join lateral (
    select count(*)::integer as total,
      count(*) filter (where a.status in ('interview', 'final_interview'))::integer as interviews,
      count(*) filter (where a.status = 'offer')::integer as offers,
      max(greatest(a.applied_at, a.created_at, a.updated_at)) as last_date
    from public.applications a where a.user_id = m.student_id and m.share_applications) s on true
  where (c.teacher_id = p_uid or exists (select 1 from public.class_teachers t where t.class_id = c.id and t.teacher_id = p_uid))
    and (p_class is null or c.id = p_class);
$$;

-- ---------- role ----------
-- Switch between student and teacher. Only while the user is in no class at all.
create or replace function public.set_my_role(p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid();
begin
  if p_role is null or p_role not in ('student', 'teacher') then raise exception 'INVALID_REQUEST'; end if;
  if exists (select 1 from public.user_roles r where r.user_id = uid and r.role = p_role) then return; end if;
  if exists (select 1 from public.classes c where c.teacher_id = uid)
    or exists (select 1 from public.class_teachers t where t.teacher_id = uid)
    or exists (select 1 from public.class_members m where m.student_id = uid) then
    raise exception 'FORBIDDEN';
  end if;
  update public.user_roles r set role = p_role where r.user_id = uid;
end;
$$;

-- ---------- classes (teacher) ----------
-- Shape change (appended archived, is_owner) -> recreate. Owned and co-taught classes.
drop function if exists public.class_list_mine();
create function public.class_list_mine()
returns table (id uuid, name text, school_year text, join_code text, created_at timestamptz, member_count integer, archived boolean, is_owner boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_require_role('teacher');
begin
  return query
    select c.id, c.name, c.school_year, c.join_code, c.created_at, (select count(*)::integer from public.class_members m where m.class_id = c.id),
      c.archived, c.teacher_id = uid
    from public.classes c
    where c.teacher_id = uid or exists (select 1 from public.class_teachers t where t.class_id = c.id and t.teacher_id = uid)
    order by c.archived, c.created_at desc, c.id;
end;
$$;

-- Deleting a class is owner-only (was: any teacher of the class).
create or replace function public.class_delete(p_class_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._soc_owner_of(p_class_id);
  delete from public.classes c where c.id = p_class_id;
end;
$$;

create or replace function public.class_set_archived(p_class_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._soc_teacher_of(p_class_id);
  if p_archived is null then raise exception 'INVALID_REQUEST'; end if;
  update public.classes c set archived = p_archived, archived_at = case when p_archived then now() end where c.id = p_class_id;
end;
$$;

create or replace function public.class_add_coteacher(p_class_id uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_owner_of(p_class_id); target uuid;
begin
  select r.user_id into target from public.user_roles r where lower(r.email) = lower(btrim(coalesce(p_email, ''))) and r.role = 'teacher';
  if target is null then raise exception 'NOT_FOUND'; end if;
  if target = uid then raise exception 'INVALID_REQUEST'; end if;
  insert into public.class_teachers (class_id, teacher_id) values (p_class_id, target) on conflict do nothing;
end;
$$;

-- Owner removes any co-teacher; a co-teacher may remove themselves.
create or replace function public.class_remove_coteacher(p_class_id uuid, p_teacher_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_require_role('teacher');
begin
  if p_teacher_id = uid then
    delete from public.class_teachers t where t.class_id = p_class_id and t.teacher_id = uid;
    if not found then raise exception 'FORBIDDEN'; end if;
  else
    perform public._soc_owner_of(p_class_id);
    delete from public.class_teachers t where t.class_id = p_class_id and t.teacher_id = p_teacher_id;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;
end;
$$;

create or replace function public.class_coteachers(p_class_id uuid)
returns table (teacher_id uuid, display_name text, avatar_seed text, email text, added_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._soc_teacher_of(p_class_id);
  return query
    select t.teacher_id, r.display_name, r.avatar_seed, r.email, t.added_at
    from public.class_teachers t join public.user_roles r on r.user_id = t.teacher_id
    where t.class_id = p_class_id order by t.added_at, t.teacher_id;
end;
$$;

-- ---------- overview data respecting the granular consent switches ----------
create or replace function public.class_members(p_class_id uuid)
returns table (student_id uuid, display_name text, avatar_seed text, joined_at timestamptz, hidden boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._soc_teacher_of(p_class_id);
  return query
    select m.student_id, r.display_name, r.avatar_seed, m.joined_at, not m.share_applications
    from public.class_members m join public.user_roles r on r.user_id = m.student_id
    where m.class_id = p_class_id order by r.display_name, m.student_id;
end;
$$;

create or replace function public.class_overview(p_class_id uuid)
returns table (student_id uuid, display_name text, avatar_seed text, hidden boolean, total integer, status_counts jsonb,
  last_7_days integer, last_30_days integer, latest_company text, latest_position text, latest_status text, latest_date date, upcoming_deadlines jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._soc_teacher_of(p_class_id);
  return query
    select m.student_id, r.display_name, r.avatar_seed, not m.share_applications,
      case when m.share_applications then (select count(*)::integer from public.applications a where a.user_id = m.student_id) else 0 end,
      case when m.share_applications and m.share_status then public._soc_status_counts(m.student_id) else '{}'::jsonb end,
      case when m.share_applications then (select count(*)::integer from public.applications a where a.user_id = m.student_id and coalesce(a.applied_at, a.created_at) >= current_date - 7) else 0 end,
      case when m.share_applications then (select count(*)::integer from public.applications a where a.user_id = m.student_id and coalesce(a.applied_at, a.created_at) >= current_date - 30) else 0 end,
      case when m.share_companies then l.company end, case when m.share_companies then l.position end,
      case when m.share_status then l.status end, l.activity,
      case when m.share_applications and m.share_companies then coalesce((
        select jsonb_agg(jsonb_build_object('applicationId', d.id, 'company', d.company, 'position', d.position, 'deadline', d.deadline) order by d.deadline, d.id)
        from (select a.id, a.company, a.position, a.deadline from public.applications a
          where a.user_id = m.student_id and a.deadline >= current_date and a.status in ('saved', 'preparing')
          order by a.deadline, a.id limit 5) d), '[]'::jsonb) else '[]'::jsonb end
    from public.class_members m
    join public.user_roles r on r.user_id = m.student_id
    left join lateral (
      select a.company, a.position, a.status, coalesce(a.applied_at, a.created_at) as activity
      from public.applications a where a.user_id = m.student_id and m.share_applications
      order by coalesce(a.applied_at, a.created_at) desc, a.id desc limit 1) l on true
    where m.class_id = p_class_id
    order by r.display_name, m.student_id;
end;
$$;

-- Shared fields only: company/position need share_companies, status needs share_status. Never notes/salary/contacts/documents/links.
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
      case when m.share_status then a.status end, a.category,
      case when m.share_companies then a.location end, a.deadline, a.applied_at, a.created_at, a.updated_at
    from public.applications a where a.user_id = p_student_id
    order by a.updated_at desc, a.id;
end;
$$;

-- Event timeline of the shared fields. There is no stored status history, so events are derived from the dates:
-- created (status 'saved'), applied (status 'applied'), updated (current status, if changed later), deadline (current status).
create or replace function public.class_student_timeline(p_class_id uuid, p_student_id uuid)
returns table (hidden boolean, application_id text, company text, "position" text, status text, event_date date, kind text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare m public.class_members;
begin
  perform public._soc_teacher_of(p_class_id);
  select * into m from public.class_members x where x.class_id = p_class_id and x.student_id = p_student_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not m.share_applications then
    return query select true, null::text, null::text, null::text, null::text, null::date, null::text;
    return;
  end if;
  return query
    select false, a.id,
      case when m.share_companies then a.company end, case when m.share_companies then a.position end,
      case when m.share_status then ev.st end, ev.d, ev.k
    from public.applications a
    cross join lateral (values
      ('created'::text, a.created_at, 'saved'::text),
      ('applied'::text, a.applied_at, 'applied'::text),
      ('updated'::text, case when a.updated_at > a.created_at and a.updated_at is distinct from a.applied_at then a.updated_at end, a.status),
      ('deadline'::text, a.deadline, a.status)) as ev(k, d, st)
    where a.user_id = p_student_id and ev.d is not null
    order by ev.d desc, a.id, ev.k;
end;
$$;

create or replace function public.teacher_class_students(p_class_id uuid, p_inactive_days integer default 14)
returns table (student_id uuid, display_name text, avatar_seed text, joined_at timestamptz, hidden boolean, total integer, status_counts jsonb,
  interviews integer, offers integer, placed boolean, last_activity timestamptz, inactive boolean, last_nudged_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._soc_teacher_of(p_class_id);
  return query
    select s.student_id, s.display_name, s.avatar_seed, s.joined_at, s.hidden, s.total, s.status_counts, s.interviews, s.offers, s.offers > 0,
      s.last_activity, s.inactive,
      (select max(n.created_at) from public.class_notifications n where n.kind = 'nudge' and n.class_id = s.class_id and n.user_id = s.student_id)
    from public._teacher_stats(public._soc_uid(), least(greatest(coalesce(p_inactive_days, 14), 1), 365), p_class_id) s
    order by s.display_name, s.student_id;
end;
$$;

-- Dashboard of all (non-archived for totals) classes. interviews/offers = number of applications; placed = number of students with an offer.
-- Students in several of the teacher's classes are counted once in the totals.
create or replace function public.teacher_dashboard(p_inactive_days integer default 14)
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
      (count(*) filter (where st.offers > 0))::integer as placed, (count(*) filter (where st.inactive))::integer as inactive,
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
      'offers', (select coalesce(sum(offers), 0) from uniq), 'placed', (select count(*) from uniq where offers > 0),
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

-- ---------- invitations ----------
create or replace function public._teacher_valid_email(p_email text)
returns boolean language sql immutable set search_path = '' as $$
  select p_email is not null and length(p_email) <= 254 and p_email ~ '^[^@[:space:],;<>]+@[^@[:space:],;<>]+\.[^@[:space:],;<>]+$';
$$;

create or replace function public._teacher_new_token()
returns text language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

create or replace function public.class_invite_create(p_class_id uuid, p_email text default null, p_max_uses integer default null, p_expires_in_days integer default 14)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_teacher_of(p_class_id); mail text := nullif(lower(btrim(coalesce(p_email, ''))), ''); inv public.class_invitations;
begin
  if mail is not null and not public._teacher_valid_email(mail) then raise exception 'INVALID_EMAIL'; end if;
  if p_max_uses is not null and p_max_uses not between 1 and 500 then raise exception 'INVALID_REQUEST'; end if;
  if coalesce(p_expires_in_days, 14) not between 1 and 90 then raise exception 'INVALID_REQUEST'; end if;
  if exists (select 1 from public.classes c where c.id = p_class_id and c.archived) then raise exception 'ARCHIVED'; end if;
  insert into public.class_invitations (class_id, token, email, max_uses, expires_at, created_by)
    values (p_class_id, public._teacher_new_token(), mail, p_max_uses, now() + make_interval(days => coalesce(p_expires_in_days, 14)), uid)
    returning * into inv;
  return query select inv.id, inv.token, inv.expires_at;
end;
$$;

-- One single-use, e-mail-bound invitation per address (deduplicated, max 60, all-or-nothing validation).
create or replace function public.class_invite_create_many(p_class_id uuid, p_emails text[], p_expires_in_days integer default 14)
returns table (email text, token text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_teacher_of(p_class_id); list text[]; mail text; tok text;
begin
  if coalesce(p_expires_in_days, 14) not between 1 and 90 then raise exception 'INVALID_REQUEST'; end if;
  select coalesce(array_agg(x.m order by x.m), '{}') into list from (select distinct lower(btrim(e)) as m from unnest(coalesce(p_emails, '{}')) e where nullif(btrim(e), '') is not null) x;
  if coalesce(array_length(list, 1), 0) = 0 or array_length(list, 1) > 60 then raise exception 'INVALID_REQUEST'; end if;
  foreach mail in array list loop
    if not public._teacher_valid_email(mail) then raise exception 'INVALID_EMAIL'; end if;
  end loop;
  if exists (select 1 from public.classes c where c.id = p_class_id and c.archived) then raise exception 'ARCHIVED'; end if;
  foreach mail in array list loop
    tok := public._teacher_new_token();
    insert into public.class_invitations (class_id, token, email, max_uses, expires_at, created_by)
      values (p_class_id, tok, mail, 1, now() + make_interval(days => coalesce(p_expires_in_days, 14)), uid);
    email := mail; token := tok; return next;
  end loop;
end;
$$;

create or replace function public.class_invite_list(p_class_id uuid)
returns table (id uuid, token text, email text, max_uses integer, uses integer, expires_at timestamptz, revoked boolean, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._soc_teacher_of(p_class_id);
  return query
    select i.id, i.token, i.email, i.max_uses, i.uses, i.expires_at, i.revoked, i.created_at
    from public.class_invitations i where i.class_id = p_class_id order by i.created_at desc, i.id;
end;
$$;

create or replace function public.class_invite_revoke(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  perform public._soc_require_role('teacher');
  select i.class_id into cid from public.class_invitations i where i.id = p_invitation_id;
  if cid is null then raise exception 'NOT_FOUND'; end if;
  perform public._soc_teacher_of(cid);
  update public.class_invitations i set revoked = true where i.id = p_invitation_id;
end;
$$;

-- Why an invitation cannot be used by this user, or null if it can.
create or replace function public._teacher_invite_reason(p_inv public.class_invitations, p_uid uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare mail text;
begin
  if p_inv.id is null then return 'INVALID'; end if;
  if p_inv.revoked then return 'REVOKED'; end if;
  if p_inv.expires_at <= now() then return 'EXPIRED'; end if;
  if p_inv.max_uses is not null and p_inv.uses >= p_inv.max_uses then return 'USED_UP'; end if;
  if exists (select 1 from public.classes c where c.id = p_inv.class_id and c.archived) then return 'ARCHIVED'; end if;
  if p_inv.email is not null then
    select lower(u.email) into mail from auth.users u where u.id = p_uid;
    if mail is distinct from p_inv.email then return 'WRONG_EMAIL'; end if;
  end if;
  return null;
end;
$$;

-- Class details are only revealed to someone holding a token that is currently usable for them (or who is already a member).
create or replace function public.class_invite_preview(p_token text)
returns table (class_id uuid, name text, school_year text, teacher_name text, member_count integer, already_member boolean, valid boolean, reason text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid(); inv public.class_invitations; why text; member boolean;
begin
  select * into inv from public.class_invitations i where i.token = btrim(coalesce(p_token, ''));
  member := found and exists (select 1 from public.class_members m where m.class_id = inv.class_id and m.student_id = uid);
  why := case when member then null else public._teacher_invite_reason(inv, uid) end;
  if inv.id is null or (why is not null and why <> 'ARCHIVED') then
    return query select null::uuid, null::text, null::text, null::text, null::integer, false, false, coalesce(why, 'INVALID');
    return;
  end if;
  return query
    select c.id, c.name, c.school_year, t.display_name, (select count(*)::integer from public.class_members m where m.class_id = c.id), member,
      why is null, why
    from public.classes c join public.user_roles t on t.user_id = c.teacher_id where c.id = inv.class_id;
end;
$$;

create or replace function public.class_invite_accept(p_token text)
returns table (class_id uuid, name text, school_year text, teacher_name text, share_applications boolean, joined_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_require_role('student'); inv public.class_invitations; why text; added integer;
begin
  select * into inv from public.class_invitations i where i.token = btrim(coalesce(p_token, '')) for update;
  if not found then raise exception 'INVITE_INVALID'; end if;
  if not exists (select 1 from public.class_members m where m.class_id = inv.class_id and m.student_id = uid) then
    why := public._teacher_invite_reason(inv, uid);
    if why = 'WRONG_EMAIL' then raise exception 'FORBIDDEN'; end if;
    if why = 'INVALID' then raise exception 'INVITE_INVALID'; end if;
    if why is not null then raise exception '%', why; end if;
    insert into public.class_members (class_id, student_id) values (inv.class_id, uid) on conflict do nothing;
    get diagnostics added = row_count;
    if added > 0 then update public.class_invitations i set uses = i.uses + 1 where i.id = inv.id; end if;
  end if;
  return query
    select c.id, c.name, c.school_year, t.display_name, m.share_applications, m.joined_at
    from public.classes c
    join public.class_members m on m.class_id = c.id and m.student_id = uid
    join public.user_roles t on t.user_id = c.teacher_id
    where c.id = inv.class_id;
end;
$$;

-- Joining by the short code is not possible for archived classes.
create or replace function public.class_join(p_code text)
returns table (class_id uuid, name text, school_year text, teacher_name text, share_applications boolean, joined_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_require_role('student'); c public.classes;
begin
  select * into c from public.classes x where x.join_code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'CLASS_NOT_FOUND'; end if;
  if c.archived and not exists (select 1 from public.class_members m where m.class_id = c.id and m.student_id = uid) then raise exception 'ARCHIVED'; end if;
  insert into public.class_members (class_id, student_id) values (c.id, uid) on conflict do nothing;
  return query
    select c.id, c.name, c.school_year, t.display_name, m.share_applications, m.joined_at
    from public.class_members m join public.user_roles t on t.user_id = c.teacher_id
    where m.class_id = c.id and m.student_id = uid;
end;
$$;

-- ---------- consent / transparency (student) ----------
drop function if exists public.class_my_classes();
create function public.class_my_classes()
returns table (class_id uuid, name text, school_year text, teacher_name text, share_applications boolean, joined_at timestamptz,
  share_companies boolean, last_nudge_at timestamptz, announcements_count integer, share_status boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid();
begin
  return query
    select c.id, c.name, c.school_year, t.display_name, m.share_applications, m.joined_at, m.share_companies,
      (select max(n.created_at) from public.class_notifications n where n.kind = 'nudge' and n.class_id = c.id and n.user_id = uid),
      (select count(*)::integer from public.class_announcements an where an.class_id = c.id),
      m.share_status
    from public.class_members m join public.classes c on c.id = m.class_id join public.user_roles t on t.user_id = c.teacher_id
    where m.student_id = uid order by m.joined_at desc, c.id;
end;
$$;

-- p_share = master switch (false: teacher sees only the name). p_companies / p_status: null = leave unchanged.
create or replace function public.class_set_sharing_v2(p_class_id uuid, p_share boolean, p_companies boolean default null, p_status boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid();
begin
  if p_share is null then raise exception 'INVALID_REQUEST'; end if;
  update public.class_members m set share_applications = p_share,
    share_companies = coalesce(p_companies, m.share_companies), share_status = coalesce(p_status, m.share_status)
  where m.class_id = p_class_id and m.student_id = uid;
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

create or replace function public.class_visibility_info()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'teacher_sees', jsonb_build_array(
      'Deinen Namen und dein Profilbild',
      'Wie viele Bewerbungen du hast und wann du zuletzt aktiv warst',
      'Den Stand deiner Bewerbungen (z. B. beworben, Gespräch, Lehrstelle gefunden), wenn "Status teilen" an ist',
      'Firmennamen, Stellenbezeichnung, Ort und Fristen, wenn "Firmen teilen" an ist'),
    'teacher_never_sees', jsonb_build_array(
      'Deine Notizen',
      'Dokumente, Lebenslauf und Zeugnisse',
      'Kontaktpersonen und Links zu Stellenanzeigen',
      'Gehaltsangaben',
      'Deine Bewerbungen, wenn du das Teilen ganz ausschaltest (dann sieht deine Lehrperson nur deinen Namen)'));
$$;

-- ---------- announcements and nudges ----------
create or replace function public.class_announce(p_class_id uuid, p_text text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_teacher_of(p_class_id); body text := btrim(coalesce(p_text, '')); new_id uuid;
begin
  if length(body) not between 1 and 500 then raise exception 'INVALID_REQUEST'; end if;
  insert into public.class_announcements (class_id, author_id, text) values (p_class_id, uid, body) returning id into new_id;
  insert into public.class_notifications (user_id, kind, class_id, actor_id, message)
    select m.student_id, 'announcement', p_class_id, uid, body from public.class_members m where m.class_id = p_class_id;
  return new_id;
end;
$$;

create or replace function public.class_announcement_list(p_class_id uuid)
returns table (id uuid, text text, created_at timestamptz, author_name text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid();
begin
  if not (public._soc_can_teach(uid, p_class_id) or exists (select 1 from public.class_members m where m.class_id = p_class_id and m.student_id = uid)) then
    raise exception 'FORBIDDEN';
  end if;
  return query
    select a.id, a.text, a.created_at, r.display_name
    from public.class_announcements a left join public.user_roles r on r.user_id = a.author_id
    where a.class_id = p_class_id order by a.created_at desc, a.id limit 100;
end;
$$;

-- Friendly reminder to one student; at most one per student and class every 3 days (RATE_LIMITED).
create or replace function public.class_nudge(p_class_id uuid, p_student_id uuid, p_message text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_teacher_of(p_class_id); body text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if body is not null and length(body) > 200 then raise exception 'INVALID_REQUEST'; end if;
  if exists (select 1 from public.classes c where c.id = p_class_id and c.archived) then raise exception 'ARCHIVED'; end if;
  -- the row lock serialises concurrent nudges for the same student
  perform 1 from public.class_members m where m.class_id = p_class_id and m.student_id = p_student_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.class_notifications n where n.kind = 'nudge' and n.class_id = p_class_id and n.user_id = p_student_id
    and n.created_at > now() - interval '3 days') then
    raise exception 'RATE_LIMITED';
  end if;
  insert into public.class_notifications (user_id, kind, class_id, actor_id, message) values (p_student_id, 'nudge', p_class_id, uid, body);
end;
$$;

create or replace function public.my_notifications()
returns table (id uuid, kind text, class_id uuid, class_name text, message text, created_at timestamptz, "read" boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid();
begin
  return query
    select n.id, n.kind, n.class_id, c.name, n.message, n.created_at, n.read_at is not null
    from public.class_notifications n left join public.classes c on c.id = n.class_id
    where n.user_id = uid order by n.created_at desc, n.id limit 100;
end;
$$;

create or replace function public.mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid();
begin
  update public.class_notifications n set read_at = coalesce(n.read_at, now()) where n.id = p_id and n.user_id = uid;
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

-- ---------- privileges: public RPCs for authenticated only, internals for nobody ----------
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and (
    p.proname like 'social\_%' or p.proname like 'class\_%' or p.proname like '\_soc\_%' or p.proname like '\_teacher\_%'
    or p.proname in ('set_my_role', 'teacher_dashboard', 'teacher_class_students', 'my_notifications', 'mark_notification_read')) loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and (
    p.proname like 'social\_%' or p.proname like 'class\_%'
    or p.proname in ('set_my_role', 'teacher_dashboard', 'teacher_class_students', 'my_notifications', 'mark_notification_read')) loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
