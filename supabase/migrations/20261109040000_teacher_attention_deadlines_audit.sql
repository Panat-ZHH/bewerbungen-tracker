-- P0 part g (teacher): class deadlines (calendar), view/export audit log, voluntary "noch keine Lehrstelle" self-report,
-- "Braucht Aufmerksamkeit" list, bulk invites with per-address outcome, per-application CSV export.
-- Run AFTER 20261107000000_teacher_role.sql. Idempotent and additive only (no existing rows or functions are changed).
-- Same model as the teacher-role migration: new tables have RLS enabled and NO grants/policies (direct access denied for everybody),
-- every read/write goes through security-definer RPCs (set search_path = '') that check auth.uid() / teacher-of-class / membership.
-- Teachers see only what students consented to (share_applications / share_status / share_companies). The only data a student may
-- release on top of that is the voluntary self-report flag (self_report_no_placement), which is never derived from application data.

-- ---------- columns and tables ----------
alter table public.class_members add column if not exists self_report_no_placement boolean not null default false;

create table if not exists public.class_deadlines (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  due_date date not null,
  note text check (note is null or length(note) <= 300),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists class_deadlines_class_idx on public.class_deadlines (class_id, due_date);

-- One row per teacher, student, class, kind and day (re-opening a profile the same day is not logged twice).
create table if not exists public.class_view_log (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('view', 'export')),
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (class_id, teacher_id, student_id, kind, viewed_on)
);
create index if not exists class_view_log_student_idx on public.class_view_log (student_id, created_at desc);

alter table public.class_deadlines enable row level security;
alter table public.class_view_log enable row level security;
revoke all on public.class_deadlines, public.class_view_log from anon, authenticated;

-- ---------- class deadlines ----------
create or replace function public.class_deadline_add(p_class_id uuid, p_title text, p_due_date date, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_teacher_of(p_class_id); t text := btrim(coalesce(p_title, '')); n text := nullif(btrim(coalesce(p_note, '')), ''); new_id uuid;
begin
  if length(t) not between 1 and 120 or p_due_date is null or (n is not null and length(n) > 300) then raise exception 'INVALID_REQUEST'; end if;
  if exists (select 1 from public.classes c where c.id = p_class_id and c.archived) then raise exception 'ARCHIVED'; end if;
  insert into public.class_deadlines (class_id, title, due_date, note, created_by) values (p_class_id, t, p_due_date, n, uid) returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.class_deadline_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  select d.class_id into cid from public.class_deadlines d where d.id = p_id;
  if cid is null then raise exception 'NOT_FOUND'; end if;
  perform public._soc_teacher_of(cid);
  delete from public.class_deadlines d where d.id = p_id;
end;
$$;

-- Teachers of the class and members of the class may read the class deadlines.
create or replace function public.class_deadline_list(p_class_id uuid, p_from date default null, p_to date default null)
returns table (id uuid, class_id uuid, class_name text, title text, due_date date, note text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid();
begin
  if not (public._soc_can_teach(uid, p_class_id) or exists (select 1 from public.class_members m where m.class_id = p_class_id and m.student_id = uid)) then
    raise exception 'FORBIDDEN';
  end if;
  return query
    select d.id, d.class_id, c.name, d.title, d.due_date, d.note
    from public.class_deadlines d join public.classes c on c.id = d.class_id
    where d.class_id = p_class_id and (p_from is null or d.due_date >= p_from) and (p_to is null or d.due_date <= p_to)
    order by d.due_date, d.created_at, d.id;
end;
$$;

-- Student view: class deadlines of all own classes from today on.
create or replace function public.my_class_deadlines(p_days integer default 60)
returns table (id uuid, class_id uuid, class_name text, title text, due_date date, note text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid();
begin
  return query
    select d.id, d.class_id, c.name, d.title, d.due_date, d.note
    from public.class_deadlines d
    join public.classes c on c.id = d.class_id
    join public.class_members m on m.class_id = d.class_id and m.student_id = uid
    where not c.archived and d.due_date between current_date and current_date + least(greatest(coalesce(p_days, 60), 1), 365)
    order by d.due_date, d.created_at, d.id;
end;
$$;

-- ---------- voluntary self-report "noch keine Lehrstelle" ----------
create or replace function public.class_set_self_report(p_class_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid();
begin
  update public.class_members m set self_report_no_placement = coalesce(p_value, false) where m.class_id = p_class_id and m.student_id = uid;
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

create or replace function public.my_self_reports()
returns table (class_id uuid, class_name text, self_report boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid();
begin
  return query
    select m.class_id, c.name, m.self_report_no_placement
    from public.class_members m join public.classes c on c.id = m.class_id
    where m.student_id = uid and not c.archived order by c.name, m.class_id;
end;
$$;

-- ---------- "Braucht Aufmerksamkeit" ----------
-- One row per student and class with the most relevant reason, priority: self_report > no_application > no_reply.
--   self_report    : the student voluntarily said "noch keine Lehrstelle" (the ONLY way a non-sharing student can appear here)
--   no_application : sharing student without any application
--   no_reply       : sharing student (status shared) whose oldest application still in 'applied' is >= p_days old; days = its age
-- Students with an offer are never listed (when their status is shared). Unknown/new statuses count as "has a reply".
create or replace function public.teacher_attention(p_class_id uuid default null, p_days integer default 14)
returns table (class_id uuid, class_name text, student_id uuid, display_name text, reason text, days integer, open_count integer, self_report boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_require_role('teacher'); d integer := least(greatest(coalesce(p_days, 14), 1), 365);
begin
  if p_class_id is not null then perform public._soc_teacher_of(p_class_id); end if;
  return query
  with mine as (
    select m.class_id, c.name as cname, m.student_id, r.display_name as dname, m.share_applications as sa, m.share_status as ss, m.self_report_no_placement as sr
    from public.class_members m
    join public.classes c on c.id = m.class_id
    join public.user_roles r on r.user_id = m.student_id
    where not c.archived and (p_class_id is null or c.id = p_class_id)
      and (c.teacher_id = uid or exists (select 1 from public.class_teachers t where t.class_id = c.id and t.teacher_id = uid))),
  st as (
    select mi.*,
      case when mi.sa then (select count(*)::integer from public.applications a where a.user_id = mi.student_id) end as total,
      case when mi.sa and mi.ss then (select count(*)::integer from public.applications a where a.user_id = mi.student_id and a.status = 'offer') end as offers,
      case when mi.sa and mi.ss then (select count(*)::integer from public.applications a where a.user_id = mi.student_id and a.status = 'applied' and a.applied_at is not null and a.applied_at <= current_date - d) end as stale_n,
      case when mi.sa and mi.ss then (select (current_date - min(a.applied_at))::integer from public.applications a where a.user_id = mi.student_id and a.status = 'applied' and a.applied_at is not null and a.applied_at <= current_date - d) end as stale_days
    from mine mi)
  select s.class_id, s.cname, s.student_id, s.dname,
    case when s.sr then 'self_report' when s.sa and s.total = 0 then 'no_application' else 'no_reply' end,
    case when s.sr or s.total = 0 then 0 else coalesce(s.stale_days, 0) end,
    coalesce(s.stale_n, 0),
    s.sr
  from st s
  where coalesce(s.offers, 0) = 0 and (s.sr or (s.sa and s.total = 0) or coalesce(s.stale_n, 0) > 0)
  order by (case when s.sr then 0 when s.sa and s.total = 0 then 1 else 2 end), coalesce(s.stale_days, 0) desc, s.dname, s.student_id;
end;
$$;

-- ---------- bulk invites with per-address outcome ----------
-- outcome: created | already_invited (an active invitation for that address exists, its token is returned) | already_member |
--          duplicate (same address twice in the input) | invalid. Never raises for a single bad address.
create or replace function public.class_invite_create_many_v2(p_class_id uuid, p_emails text[], p_expires_in_days integer default 14)
returns table (email text, outcome text, token text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_teacher_of(p_class_id); raw text; mail text; tok text; seen text[] := '{}'; inv public.class_invitations;
begin
  if coalesce(p_expires_in_days, 14) not between 1 and 90 then raise exception 'INVALID_REQUEST'; end if;
  if coalesce(array_length(p_emails, 1), 0) = 0 or array_length(p_emails, 1) > 200 then raise exception 'INVALID_REQUEST'; end if;
  if exists (select 1 from public.classes c where c.id = p_class_id and c.archived) then raise exception 'ARCHIVED'; end if;
  foreach raw in array p_emails loop
    mail := lower(btrim(coalesce(raw, '')));
    if mail = '' then continue; end if;
    email := mail; token := null;
    if mail = any (seen) then outcome := 'duplicate'; return next; continue; end if;
    seen := seen || mail;
    if not public._teacher_valid_email(mail) then outcome := 'invalid'; return next; continue; end if;
    if exists (select 1 from auth.users u join public.class_members m on m.student_id = u.id where lower(u.email) = mail and m.class_id = p_class_id) then
      outcome := 'already_member'; return next; continue;
    end if;
    select i.* into inv from public.class_invitations i
      where i.class_id = p_class_id and i.email = mail and not i.revoked and i.expires_at > now() and (i.max_uses is null or i.uses < i.max_uses)
      order by i.created_at desc limit 1;
    if found then outcome := 'already_invited'; token := inv.token; return next; continue; end if;
    tok := public._teacher_new_token();
    insert into public.class_invitations (class_id, token, email, max_uses, expires_at, created_by)
      values (p_class_id, tok, mail, 1, now() + make_interval(days => coalesce(p_expires_in_days, 14)), uid);
    outcome := 'created'; token := tok; return next;
  end loop;
end;
$$;

-- ---------- audit log: "Lehrperson hat angesehen" ----------
create or replace function public.class_log_view(p_class_id uuid, p_student_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_teacher_of(p_class_id);
begin
  if not exists (select 1 from public.class_members m where m.class_id = p_class_id and m.student_id = p_student_id) then raise exception 'NOT_FOUND'; end if;
  insert into public.class_view_log (class_id, teacher_id, student_id, kind) values (p_class_id, uid, p_student_id, 'view') on conflict do nothing;
end;
$$;

-- The student sees who looked at their data (own entries only).
create or replace function public.my_view_log(p_limit integer default 20)
returns table (id uuid, class_id uuid, class_name text, teacher_name text, kind text, viewed_on date)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid();
begin
  return query
    select l.id, l.class_id, c.name, coalesce(r.display_name, ''), l.kind, l.viewed_on
    from public.class_view_log l
    join public.classes c on c.id = l.class_id
    left join public.user_roles r on r.user_id = l.teacher_id
    where l.student_id = uid
    order by l.created_at desc, l.id limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

-- ---------- per-person CSV export (consented fields only) ----------
-- One row per application of every student who shares applications. company/position need share_companies, status needs share_status.
-- Never notes, salary, contacts, documents or links. Every exported student gets an 'export' audit entry.
create or replace function public.teacher_class_applications_export(p_class_id uuid)
returns table (student_id uuid, display_name text, company text, "position" text, status text, applied_at date, deadline date, created_at date)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_teacher_of(p_class_id);
begin
  insert into public.class_view_log (class_id, teacher_id, student_id, kind)
    select m.class_id, uid, m.student_id, 'export' from public.class_members m where m.class_id = p_class_id and m.share_applications
    on conflict do nothing;
  return query
    select m.student_id, r.display_name,
      case when m.share_companies then a.company end, case when m.share_companies then a.position end,
      case when m.share_status then a.status end, a.applied_at, a.deadline, a.created_at
    from public.class_members m
    join public.user_roles r on r.user_id = m.student_id
    join public.applications a on a.user_id = m.student_id
    where m.class_id = p_class_id and m.share_applications
    order by r.display_name, m.student_id, coalesce(a.applied_at, a.created_at), a.id;
end;
$$;

-- ---------- privileges: RPCs for authenticated only ----------
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
    'class_deadline_add', 'class_deadline_delete', 'class_deadline_list', 'my_class_deadlines', 'class_set_self_report', 'my_self_reports',
    'teacher_attention', 'class_invite_create_many_v2', 'class_log_view', 'my_view_log', 'teacher_class_applications_export') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
