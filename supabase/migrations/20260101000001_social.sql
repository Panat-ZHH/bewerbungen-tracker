-- Social (friends / invites) and teacher classes. Run AFTER supabase/schema.sql. Idempotent.
-- Users never read foreign rows directly: all cross-user access goes through the security-definer RPCs below.

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'teacher')),
  display_name text not null default '',
  avatar_seed text not null default '',
  invite_code text not null unique,
  email text,
  share_with_friends boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists user_roles_email_idx on public.user_roles (lower(email));

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
create unique index if not exists friendships_pair_idx on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  school_year text not null default '' check (length(school_year) <= 20),
  join_code text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists classes_teacher_idx on public.classes (teacher_id);

create table if not exists public.class_members (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  share_applications boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);
create index if not exists class_members_student_idx on public.class_members (student_id);

alter table public.user_roles enable row level security;
alter table public.friendships enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
revoke all on public.user_roles, public.friendships, public.classes, public.class_members from anon, authenticated;
grant select on public.user_roles, public.friendships, public.classes, public.class_members to authenticated;
drop policy if exists "own role" on public.user_roles;
drop policy if exists "own friendships" on public.friendships;
drop policy if exists "own classes" on public.classes;
drop policy if exists "own memberships" on public.class_members;
create policy "own role" on public.user_roles for select to authenticated using (auth.uid() = user_id);
create policy "own friendships" on public.friendships for select to authenticated using (auth.uid() in (requester_id, addressee_id));
create policy "own classes" on public.classes for select to authenticated using (auth.uid() = teacher_id);
create policy "own memberships" on public.class_members for select to authenticated using (auth.uid() = student_id);

-- ---------- internal helpers (not granted to anyone) ----------
create or replace function public._soc_code()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; result text := ''; bytes bytea := uuid_send(gen_random_uuid()); i integer;
begin
  for i in 0..7 loop result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1); end loop;
  return result;
end;
$$;

create or replace function public._soc_new_code(p_table text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare candidate text; taken boolean;
begin
  loop
    candidate := public._soc_code();
    if p_table = 'class' then taken := exists (select 1 from public.classes c where c.join_code = candidate);
    else taken := exists (select 1 from public.user_roles r where r.invite_code = candidate); end if;
    exit when not taken;
  end loop;
  return candidate;
end;
$$;

create or replace function public._soc_ensure(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare u record; meta_role text; shown_name text;
begin
  if exists (select 1 from public.user_roles r where r.user_id = p_user) then return; end if;
  select * into u from auth.users a where a.id = p_user;
  if not found then return; end if;
  meta_role := case when u.raw_user_meta_data ->> 'role' = 'teacher' then 'teacher' else 'student' end;
  shown_name := left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'Nutzer'), 60);
  insert into public.user_roles (user_id, role, display_name, avatar_seed, invite_code, email)
    values (p_user, meta_role, shown_name, p_user::text, public._soc_new_code('user'), lower(u.email))
    on conflict do nothing;
end;
$$;

create or replace function public._soc_after_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public._soc_ensure(new.id);
  return new;
end;
$$;

drop trigger if exists social_roles_after_signup on auth.users;
create trigger social_roles_after_signup after insert on auth.users
  for each row execute function public._soc_after_signup();

do $$ declare u record; begin
  for u in select a.id from auth.users a where not exists (select 1 from public.user_roles r where r.user_id = a.id) loop
    perform public._soc_ensure(u.id);
  end loop;
end $$;

create or replace function public._soc_uid()
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform public._soc_ensure(uid);
  return uid;
end;
$$;

create or replace function public._soc_require_role(p_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid();
begin
  if not exists (select 1 from public.user_roles r where r.user_id = uid and r.role = p_role) then raise exception 'FORBIDDEN'; end if;
  return uid;
end;
$$;

create or replace function public._soc_teacher_of(p_class uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_require_role('teacher');
begin
  if not exists (select 1 from public.classes c where c.id = p_class and c.teacher_id = uid) then raise exception 'FORBIDDEN'; end if;
  return uid;
end;
$$;

create or replace function public._soc_status_counts(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
  from (select a.status, count(*)::integer as n from public.applications a where a.user_id = p_user group by a.status) s;
$$;

-- ---------- friends ----------
create or replace function public.social_my_profile()
returns table (user_id uuid, role text, display_name text, avatar_seed text, invite_code text, share_with_friends boolean, email text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid();
begin
  return query select r.user_id, r.role, r.display_name, r.avatar_seed, r.invite_code, r.share_with_friends, r.email from public.user_roles r where r.user_id = uid;
end;
$$;

create or replace function public.social_update_profile(p_display_name text default null, p_avatar_seed text default null, p_share_with_friends boolean default null)
returns table (user_id uuid, role text, display_name text, avatar_seed text, invite_code text, share_with_friends boolean, email text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid();
begin
  if p_display_name is not null and length(btrim(p_display_name)) not between 1 and 60 then raise exception 'INVALID_NAME'; end if;
  if p_avatar_seed is not null and length(p_avatar_seed) > 100 then raise exception 'INVALID_AVATAR'; end if;
  update public.user_roles r set
    display_name = coalesce(btrim(p_display_name), r.display_name),
    avatar_seed = coalesce(p_avatar_seed, r.avatar_seed),
    share_with_friends = coalesce(p_share_with_friends, r.share_with_friends)
  where r.user_id = uid;
  return query select * from public.social_my_profile();
end;
$$;

create or replace function public.social_find_by_code(p_code text)
returns table (display_name text, avatar_seed text, role text, invite_code text, relation text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid(); target record; f record; rel text := 'none';
begin
  select r.user_id, r.display_name, r.avatar_seed, r.role, r.invite_code into target from public.user_roles r where r.invite_code = upper(btrim(coalesce(p_code, '')));
  if not found then return; end if;
  if target.user_id = uid then rel := 'self';
  else
    select * into f from public.friendships x where least(x.requester_id, x.addressee_id) = least(uid, target.user_id) and greatest(x.requester_id, x.addressee_id) = greatest(uid, target.user_id);
    if found then rel := case when f.status = 'accepted' then 'friend' when f.requester_id = uid then 'pending_out' else 'pending_in' end; end if;
  end if;
  return query select target.display_name, target.avatar_seed, target.role, target.invite_code, rel;
end;
$$;

create or replace function public.social_send_request(p_code_or_email text)
returns table (id uuid, status text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid(); needle text := btrim(coalesce(p_code_or_email, '')); target uuid; f public.friendships;
begin
  if needle like '%@%' then
    select r.user_id into target from public.user_roles r where lower(r.email) = lower(needle);
  else
    select r.user_id into target from public.user_roles r where r.invite_code = upper(needle);
  end if;
  if target is null then raise exception 'USER_NOT_FOUND'; end if;
  if target = uid then raise exception 'CANNOT_ADD_SELF'; end if;
  select * into f from public.friendships x where least(x.requester_id, x.addressee_id) = least(uid, target) and greatest(x.requester_id, x.addressee_id) = greatest(uid, target);
  if found then
    if f.status = 'accepted' then raise exception 'ALREADY_FRIENDS'; end if;
    if f.requester_id = uid then raise exception 'REQUEST_PENDING'; end if;
    update public.friendships x set status = 'accepted', responded_at = now() where x.id = f.id;
    return query select f.id, 'accepted'::text;
    return;
  end if;
  insert into public.friendships (requester_id, addressee_id) values (uid, target) returning * into f;
  return query select f.id, f.status;
end;
$$;

create or replace function public.social_respond_request(p_request_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid(); f public.friendships;
begin
  select * into f from public.friendships x where x.id = p_request_id and x.addressee_id = uid and x.status = 'pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_accept then
    update public.friendships x set status = 'accepted', responded_at = now() where x.id = f.id;
    return 'accepted';
  end if;
  delete from public.friendships x where x.id = f.id;
  return 'declined';
end;
$$;

create or replace function public.social_list()
returns table (id uuid, other_user_id uuid, display_name text, avatar_seed text, role text, state text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid();
begin
  return query
    select f.id, o.user_id, o.display_name, o.avatar_seed, o.role,
      case when f.status = 'accepted' then 'friend' when f.requester_id = uid then 'outgoing' else 'incoming' end,
      f.created_at
    from public.friendships f
    join public.user_roles o on o.user_id = case when f.requester_id = uid then f.addressee_id else f.requester_id end
    where uid in (f.requester_id, f.addressee_id)
    order by f.created_at desc, f.id;
end;
$$;

-- Removes a friend, cancels an outgoing request or declines an incoming one.
create or replace function public.social_remove_friend(p_friendship_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid();
begin
  delete from public.friendships f where f.id = p_friendship_id and uid in (f.requester_id, f.addressee_id);
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

-- Limited, aggregated activity of accepted friends. Never exposes notes, CVs, salary or company names.
create or replace function public.social_friends_overview()
returns table (user_id uuid, display_name text, avatar_seed text, shared boolean, total integer, status_counts jsonb, map_points_earned integer, map_items integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid();
begin
  return query
    select r.user_id, r.display_name, r.avatar_seed, r.share_with_friends,
      case when r.share_with_friends then (select count(*)::integer from public.applications a where a.user_id = r.user_id) end,
      case when r.share_with_friends then public._soc_status_counts(r.user_id) end,
      case when r.share_with_friends then coalesce((select w.earned from public.map_wallets w where w.user_id = r.user_id), 0) end,
      case when r.share_with_friends then (select count(*)::integer from public.map_items i where i.user_id = r.user_id) end
    from public.friendships f
    join public.user_roles r on r.user_id = case when f.requester_id = uid then f.addressee_id else f.requester_id end
    where f.status = 'accepted' and uid in (f.requester_id, f.addressee_id)
    order by r.display_name, r.user_id;
end;
$$;

-- ---------- classes: teacher ----------
create or replace function public.class_create(p_name text, p_school_year text default '')
returns table (id uuid, name text, school_year text, join_code text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_require_role('teacher'); c public.classes; code text;
begin
  if length(btrim(coalesce(p_name, ''))) not between 1 and 100 then raise exception 'INVALID_NAME'; end if;
  loop
    code := public._soc_new_code('class');
    begin
      insert into public.classes (teacher_id, name, school_year, join_code) values (uid, btrim(p_name), left(btrim(coalesce(p_school_year, '')), 20), code) returning * into c;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  return query select c.id, c.name, c.school_year, c.join_code, c.created_at;
end;
$$;

create or replace function public.class_list_mine()
returns table (id uuid, name text, school_year text, join_code text, created_at timestamptz, member_count integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_require_role('teacher');
begin
  return query
    select c.id, c.name, c.school_year, c.join_code, c.created_at, (select count(*)::integer from public.class_members m where m.class_id = c.id)
    from public.classes c where c.teacher_id = uid order by c.created_at desc, c.id;
end;
$$;

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
      case when m.share_applications then public._soc_status_counts(m.student_id) else '{}'::jsonb end,
      case when m.share_applications then (select count(*)::integer from public.applications a where a.user_id = m.student_id and coalesce(a.applied_at, a.created_at) >= current_date - 7) else 0 end,
      case when m.share_applications then (select count(*)::integer from public.applications a where a.user_id = m.student_id and coalesce(a.applied_at, a.created_at) >= current_date - 30) else 0 end,
      l.company, l.position, l.status, l.activity,
      case when m.share_applications then coalesce((
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

create or replace function public.class_student_applications(p_class_id uuid, p_student_id uuid)
returns table (hidden boolean, id text, company text, "position" text, status text, category text, location text,
  deadline date, applied_at date, created_at date, updated_at date)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare shared boolean;
begin
  perform public._soc_teacher_of(p_class_id);
  select m.share_applications into shared from public.class_members m where m.class_id = p_class_id and m.student_id = p_student_id;
  if shared is null then raise exception 'NOT_FOUND'; end if;
  if not shared then
    return query select true, null::text, null::text, null::text, null::text, null::text, null::text, null::date, null::date, null::date, null::date;
    return;
  end if;
  return query
    select false, a.id, a.company, a.position, a.status, a.category, a.location, a.deadline, a.applied_at, a.created_at, a.updated_at
    from public.applications a where a.user_id = p_student_id
    order by a.updated_at desc, a.id;
end;
$$;

-- ---------- classes: student ----------
create or replace function public.class_join(p_code text)
returns table (class_id uuid, name text, school_year text, teacher_name text, share_applications boolean, joined_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_require_role('student'); c public.classes;
begin
  select * into c from public.classes x where x.join_code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'CLASS_NOT_FOUND'; end if;
  insert into public.class_members (class_id, student_id) values (c.id, uid) on conflict do nothing;
  return query
    select c.id, c.name, c.school_year, t.display_name, m.share_applications, m.joined_at
    from public.class_members m join public.user_roles t on t.user_id = c.teacher_id
    where m.class_id = c.id and m.student_id = uid;
end;
$$;

create or replace function public.class_my_classes()
returns table (class_id uuid, name text, school_year text, teacher_name text, share_applications boolean, joined_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := public._soc_uid();
begin
  return query
    select c.id, c.name, c.school_year, t.display_name, m.share_applications, m.joined_at
    from public.class_members m join public.classes c on c.id = m.class_id join public.user_roles t on t.user_id = c.teacher_id
    where m.student_id = uid order by m.joined_at desc, c.id;
end;
$$;

create or replace function public.class_set_sharing(p_class_id uuid, p_share boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid();
begin
  if p_share is null then raise exception 'INVALID_REQUEST'; end if;
  update public.class_members m set share_applications = p_share where m.class_id = p_class_id and m.student_id = uid;
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

create or replace function public.class_leave(p_class_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._soc_uid();
begin
  delete from public.class_members m where m.class_id = p_class_id and m.student_id = uid;
  if not found then raise exception 'NOT_FOUND'; end if;
end;
$$;

-- ---------- privileges: public RPCs for authenticated only, internals for nobody ----------
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'social\_%' or p.proname like 'class\_%' or p.proname like '\_soc\_%') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'social\_%' or p.proname like 'class\_%') loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
